// The desk, handed to the chat's agents as three tools. This runs in gugu's
// tool runtime on the agent owner's computer, not in the page: it opens the
// same chat file the page shows and writes there, and every open page follows.

import { openDesk } from '../../src/core/desk'
import { hueOf } from '../../src/core/text'
import type { Mark } from '../../src/core/types'

declare const gugu: any
interface Call {
  agent?: string
}

// Said in every answer, because it is the tool's answer an agent acts on last: the writer is looking at the page.
const QUIET = 'The writer already sees this on the page. Do not repeat, summarise or mention it in the chat: when you have nothing more to do on the page, end your turn with exactly [NO_REPLY] and nothing else.'

const PAGE = { type: 'string', format: 'gugu-file', description: 'The page: the id in the gugu-file:// pill of the whisper that woke you.' }

async function deskOf(page: string, { agent }: Call) {
  if (!agent) throw new Error('These tools are for agents: gugu did not say which agent is calling.')
  const f = await gugu.files.open({ id: page })
  if (f.data?.v !== 1) throw new Error(`${f.entry?.name ?? page} is not a type and memory page.`)
  const { members } = await gugu.chats.members({ chat: f.entry.chat })
  const me = members.find((m: any) => m.id === agent)
  if (!me) throw new Error('You are not a member of the chat this page is in.')
  const desk = openDesk(
    {
      text: () => String(f.data.text ?? ''),
      marks: () => Object.values(f.toJSON().marks ?? {}) as Mark[],
      put: (mark) => (f.data.marks[mark.id] = { ...mark, by: mark.by ?? agent }),
      drop: (id) => delete f.data.marks[id],
    },
    // The caller speaks under its own name; `as` lets it speak as a persona instead.
    [{ id: agent, name: me.name, hue: hueOf(agent) }],
  )
  return { desk, saved: () => whenSaved(f) }
}

/** Until the server has every write of this call: what the call answers is already what the writer sees. */
function whenSaved(f: any): Promise<void> {
  if (f.saved) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => (off(), reject(new Error('The page was not saved within 10 s; check the chat is reachable and call again.'))), 10_000)
    const off = f.onStatus(() => {
      if (f.status === 'gone') (clearTimeout(timer), off(), reject(new Error('The page file is gone.')))
      else if (f.saved) (clearTimeout(timer), off(), resolve())
    })
  })
}

export const read = {
  description: 'Read a type and memory page: what the writer has written and the notes already in its margin.',
  inputSchema: { type: 'object', required: ['page'], properties: { page: PAGE } },
  async run({ page }: { page: string }, call: Call) {
    const { desk } = await deskOf(page, call)
    const { text, marks } = desk.read()
    return {
      text,
      notes: marks.map((m) => ({ id: m.id, voice: m.voice, quote: m.quote || null, note: m.note, thread: m.thread ?? [] })),
      how_to_answer:
        'Only through annotate and reply, on the page. Nothing you write in the chat reaches the writer where they are looking. If nothing on the page earns a note, end your turn with exactly [NO_REPLY] and nothing else.',
    }
  },
}

export const annotate = {
  description:
    'Leave a note in the margin of a type and memory page (one call per note), pinned to a short phrase quoted exactly from it. Without a quote it is a whisper under the last line, for a writer who is stuck.',
  inputSchema: {
    type: 'object',
    required: ['page', 'note'],
    properties: {
      page: PAGE,
      quote: { type: 'string', description: 'A few words copied character for character from one line of the page.' },
      note: { type: 'string', description: 'One or two sentences, spoken to the writer, in the language of the page.' },
      as: { type: 'string', description: 'A persona to speak as, instead of your own name.' },
    },
  },
  async run({ page, quote, note, as }: { page: string; quote?: string; note: string; as?: string }, call: Call) {
    const { desk, saved } = await deskOf(page, call)
    const mark = desk.annotate({ quote, note, as })
    await saved()
    return `${mark.quote ? `Noted on "${mark.quote}"` : 'Whispered'} (note ${mark.id}). ${QUIET}`
  },
}

export const reply = {
  description: 'Answer the writer under a note of a type and memory page, when they replied to it.',
  inputSchema: {
    type: 'object',
    required: ['page', 'mark', 'text'],
    properties: {
      page: PAGE,
      mark: { type: 'string', description: 'The note id, from read.' },
      text: { type: 'string', description: 'One to three sentences, in the language of the page.' },
    },
  },
  async run({ page, mark, text }: { page: string; mark: string; text: string }, call: Call) {
    const { desk, saved } = await deskOf(page, call)
    desk.reply({ mark, text })
    await saved()
    return `Answered under the note. ${QUIET}`
  },
}
