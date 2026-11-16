// type and memory in DeepSeek Harness, host half. The desk becomes three
// tools of the harness's agent; the page is one Markdown file in the session's
// working directory, served to the sidebar over one route.

import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openDesk } from '../../src/core/desk'
import type { Doc, Mark } from '../../src/core/types'
import { parseSidecar, writeSidecar } from '../../src/stores/sidecar'
import { FILE, ROUTE } from './shared'

export const name = 'type-and-memory'
export const inject = ['tools', 'workingDirectory', 'connection', 'sessionController']

const load = async (dir: string): Promise<Doc> =>
  parseSidecar(await readFile(join(dir, FILE), 'utf8').catch((e) => (e.code === 'ENOENT' ? '' : Promise.reject(e))))
const store = async (dir: string, doc: Doc) => {
  const file = join(dir, FILE)
  await writeFile(`${file}.tmp`, writeSidecar(doc))
  await rename(`${file}.tmp`, file)
}
const rev = (dir: string) => stat(join(dir, FILE)).then((s) => s.mtimeMs, () => 0)

export function apply(ctx: any) {
  // One writer at a time per page: a tool call and a save from the sidebar must not interleave.
  const queues = new Map<string, Promise<unknown>>()
  const exclusive = <T>(dir: string, work: () => Promise<T>): Promise<T> => {
    const next = (queues.get(dir) ?? Promise.resolve()).then(work, work)
    queues.set(dir, next.catch(() => {}))
    return next
  }

  // ---- the desk, as the agent's tools
  const withDesk = (exec: any, act: (desk: ReturnType<typeof openDesk>, doc: Doc) => string) => {
    if (!exec.agent) throw new Error('This tool needs an agent session: the page lives in its working directory.')
    const dir = ctx.workingDirectory.get(exec.agent.session)
    return exclusive(dir, async () => {
      const doc = await load(dir)
      let dirty = false
      const desk = openDesk({
        text: () => doc.text,
        marks: () => doc.marks,
        put: (mark) => ((doc.marks = [...doc.marks.filter((m) => m.id !== mark.id), mark]), (dirty = true)),
        drop: (id) => ((doc.marks = doc.marks.filter((m) => m.id !== id)), (dirty = true)),
      }, [{ id: 'agent', name: 'Harness' }])
      const said = act(desk, doc)
      if (dirty) await store(dir, doc)
      return said
    })
  }
  const text = { schema: { type: 'string' }, render: (_args: unknown, value: string) => [{ type: 'text', text: value }] }
  const tools = [
    {
      name: 'page_read',
      description: `Read the writer's page (${FILE}): what they have written and the notes already in its margin, with their ids and threads.`,
      parameters: {},
      output: text,
      execute: (_args: unknown, exec: any) =>
        withDesk(exec, (desk) => {
          const { text, marks } = desk.read()
          return JSON.stringify({ text, notes: marks.map((m) => ({ id: m.id, voice: m.voice, quote: m.quote || null, note: m.note, thread: m.thread ?? [] })) })
        }),
    },
    {
      name: 'page_annotate',
      description:
        `Leave a note in the margin of the writer's page (one call per note; as many notes as the writer asked for, each on a different phrase), pinned to a few words quoted exactly from one line of it (two to six words, or two to ten Chinese characters). ` +
        `One or two sentences, said to the writer, in the page's language: what they wrote and could not see while writing it. No summaries, no praise, no advice lists. ` +
        `Without a quote it is a whisper under the last line, at most fifteen words, for a writer who is stuck. If the tool refuses a quote, choose another. Answer on the page, not in the conversation.`,
      parameters: {
        note: { type: 'string', required: true, description: 'The note.' },
        quote: { type: 'string', description: 'The phrase it is about, copied character for character.' },
        as: { type: 'string', description: 'A persona to speak as, instead of the default name.' },
      },
      output: text,
      execute: (args: { note: string; quote?: string; as?: string }, exec: any) =>
        withDesk(exec, (desk) => {
          const mark = desk.annotate(args)
          return mark.quote ? `Noted on "${mark.quote}" (note ${mark.id}).` : `Whispered (note ${mark.id}).`
        }),
    },
    {
      name: 'page_reply',
      description: `Answer the writer under one of the notes on their page, when they replied to it. One to three sentences, in the page's language.`,
      parameters: {
        mark: { type: 'string', required: true, description: 'The note id, from page_read.' },
        text: { type: 'string', required: true, description: 'The answer.' },
      },
      output: text,
      execute: (args: { mark: string; text: string }, exec: any) => withDesk(exec, (desk) => (desk.reply(args), 'Answered.')),
    },
  ]
  for (const tool of tools) ctx.tools.register(defineTool(tool))

  // ---- the page, for the sidebar
  ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['GET', 'PUT'],
    requestBody: 'buffered',
    // An unhandled rejection ends the harness process, so every failure becomes a response.
    fetch: async (request: Request) => {
      try {
        const found = await ctx.sessionController.resolveAgent(new URL(request.url).searchParams.get('session'))
        if (!('agent' in found)) return Response.json({ error: 'No such session.' }, { status: 404 })
        const dir = ctx.workingDirectory.get(found.agent.session)
        if (request.method === 'GET') return Response.json({ ...(await load(dir)), rev: await rev(dir) }, { headers: { 'cache-control': 'no-store' } })
        const sent: Doc & { seen: string[] } = await request.json()
        return await exclusive(dir, async () => {
          // Notes the sidebar has not seen yet were added by the agent meanwhile: keep them.
          const unseen = (await load(dir)).marks.filter((m: Mark) => !sent.seen.includes(m.id))
          await store(dir, { text: sent.text, marks: [...sent.marks, ...unseen] })
          return Response.json({ rev: await rev(dir) })
        })
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
      }
    },
  })
}
