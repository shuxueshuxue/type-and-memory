// A page written before any agent is picked. It lives in the App's own data on this device, in the shape of a
// chat's page.tam.json, until an agent is picked; then its text is carried into the page of the private chat with
// that agent, and from there on that chat file is the only copy.

import type { Mark, Store } from '../../src/core/types'

interface Data {
  read(path: string): Promise<string | null>
  write(path: string, content: string): Promise<void>
}

/** The page on this device, kept as page.tam.json keeps it: `{ v, text, marks }`. `retire` stops every later save. */
export function dataStore(data: Data, path: string): Store & { retire(): Promise<void> } {
  let retired = false
  let writing: Promise<void> = Promise.resolve()
  return {
    async load() {
      const raw = await data.read(path)
      if (!raw) return null
      const page = JSON.parse(raw)
      return { text: String(page.text ?? ''), marks: Object.values(page.marks ?? {}) as Mark[] }
    },
    save(doc) {
      if (retired) return writing
      const content = JSON.stringify({ v: 1, text: doc.text, marks: Object.fromEntries(doc.marks.map((m) => [m.id, m])) })
      writing = writing.then(() => data.write(path, content))
      return writing
    },
    async retire() {
      retired = true
      await writing
    },
  }
}

/** Where the text goes: after what the chat's page already holds, one blank line between. */
export function joined(there: string, here: string): string {
  const kept = there.replace(/\s+$/, '')
  return kept ? `${kept}\n\n${here}` : here
}

export interface Target {
  /** The chat page's text now. */
  text(): string
  /** Replace it (a merge of the letters that differ). */
  write(text: string): void
  /** Until the server has every write; rejects if it does not come. */
  saved(): Promise<void>
  /** The text as read again from the chat, after saving. */
  reread(): Promise<string>
}

/**
 * Write the text into the chat's page, read it back, and only then let go of the copy on this device. Anything that
 * fails on the way throws before `drop`, so the text stays where it was written.
 */
export async function carry(here: string, target: Target, drop: () => Promise<void>): Promise<void> {
  if (here.trim()) {
    target.write(joined(target.text(), here))
    await target.saved()
    const back = await target.reread()
    if (!back.endsWith(here)) throw new Error('the chat page did not read back with the text in it')
  }
  await drop()
}
