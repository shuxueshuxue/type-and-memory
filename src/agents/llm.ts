// An agent made of a chat-completions endpoint and a deck of personas. It
// runs wherever fetch does. Pointed at a provider it carries the writer's own
// key; pointed at the bundled server it carries none.

import { type Agent, DeskError, type Mark } from '../core/types'
import type { Persona } from './introspection'

export interface LlmOptions {
  /** Base URL of an OpenAI-compatible API, e.g. https://api.deepseek.com/v1 */
  url: string
  model: string
  key?: string
  personas: Persona[]
  fetch?: typeof fetch
}

type Message = { role: 'system' | 'user' | 'assistant'; content: string }

/** Only the recent stretch of a long page is sent; the writer is working there. */
const WINDOW = 8000
const RETRIES = 2

export function llmAgent(o: LlmOptions): Agent {
  const call = async (messages: Message[], json: boolean): Promise<string> => {
    const res = await (o.fetch ?? fetch)(`${o.url.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(o.key ? { authorization: `Bearer ${o.key}` } : {}) },
      body: JSON.stringify({ model: o.model, messages, temperature: 0.8, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
    })
    if (!res.ok) throw new Error(`The model answered ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const content = (await res.json()).choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error('The model answered without a message.')
    return content
  }
  const page = (text: string) => (text.length > WINDOW ? `[…earlier text omitted…]\n${text.slice(-WINDOW)}` : text)
  const margin = (marks: Mark[]) =>
    marks.filter((m) => m.quote).map((m) => `- ${m.voice} on "${m.quote}": ${m.note}`).join('\n') || '(none yet)'

  return (desk) => ({
    async ask(ask) {
      const { text, marks } = desk.read()

      if (ask.kind === 'reply') {
        const persona = o.personas.find((p) => p.name === ask.mark.voice) ?? o.personas[0]!
        const turns = (ask.mark.thread ?? []).map<Message>((t) => ({ role: t.from === 'writer' ? 'user' : 'assistant', content: t.text }))
        const answer = await call(
          [
            {
              role: 'system',
              content:
                `You are ${persona.name}, a voice in the margin of someone's page.\n\n${persona.prompt}\n\n` +
                `THE PAGE:\n${page(text)}\n\nYou left a note on "${ask.mark.quote}". The writer is answering it. ` +
                `Reply in one to three sentences, in character, in the writer's language. You know only what is on this page: never invent events, dates or a history it does not contain. Plain text only.`,
            },
            { role: 'assistant', content: ask.mark.note },
            ...turns,
          ],
          false,
        )
        desk.reply({ mark: ask.mark.id, text: answer, as: persona.name })
        return
      }

      if (ask.kind === 'lull') {
        // As the original did: one voice, chosen at random, a short nudge about what to write next.
        const persona = o.personas[Math.floor(Math.random() * o.personas.length)]!
        const nudge = await call(
          [
            {
              role: 'system',
              content:
                `You are ${persona.name}, a voice in the margin of someone's page.\n\n${persona.prompt}\n\n` +
                `The writer has paused. Offer ONE very short, gentle nudge about what to write next: at most fifteen words, warm, ` +
                `about possibility, not criticism; do not analyse or summarise what they wrote. Write in the language of the page. Plain text only.`,
            },
            { role: 'user', content: `THE PAGE:\n${page(text)}` },
          ],
          false,
        )
        if (nudge.trim()) desk.annotate({ note: nudge.trim(), as: persona.name })
        return
      }

      const messages: Message[] = [
        {
          role: 'system',
          content:
            `You are the voices in the margin of a page someone is writing right now. Each voice is a distinct character:\n\n` +
            o.personas.map((p) => `## ${p.id} (${p.name})\n${p.prompt}`).join('\n\n') +
            `\n\nRead the page and let at most ONE voice speak. Answer with one JSON object, one of:\n` +
            `{"voice": "<id>", "quote": "<the few words that carry it — two to six words, or two to ten Chinese characters — copied character for character from one line of the page>", "note": "<one or two sentences, spoken by that voice to the writer>"}\n` +
            `{}  — when nothing is worth saying\n\n` +
            `Never quote a phrase that already has a note. You know only what is on this page: never invent events, dates or a history the page does not contain. ` +
            `Write in the language of the page, whatever language the voice descriptions use.`,
        },
        {
          role: 'user',
          content:
            `THE PAGE:\n${page(text)}\n\nNOTES ALREADY IN THE MARGIN:\n${margin(marks)}` +
            (ask.focus ? `\n\nThe writer asks you to look at: "${ask.focus}"` : ''),
        },
      ]
      for (let attempt = 0; ; attempt++) {
        const raw = await call(messages, true)
        let said: { voice?: string; quote?: string; note?: string }
        try {
          said = JSON.parse(raw)
        } catch {
          throw new Error(`The model did not answer in JSON: ${raw.slice(0, 120)}`)
        }
        if (!said.note) return
        try {
          if (!said.quote) return
          desk.annotate({ quote: said.quote, note: said.note, as: said.voice })
          return
        } catch (error) {
          // @@@refusal-loop - the desk's refusal is written for the agent; hand it back and let it choose again.
          if (!(error instanceof DeskError) || attempt >= RETRIES) throw error
          messages.push({ role: 'assistant', content: raw }, { role: 'user', content: `${error.message} Answer again, or {} to stay silent.` })
        }
      }
    },
  })
}
