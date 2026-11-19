// Every page this person has written, in one list, whichever chat it is in. A page is a `.tam.json` file of a chat
// (found across all their chats in one search), or one kept only on this device (the App's own data). The list is the
// same everywhere; only its order depends on where it is opened: the pages of that place first, then the rest, each
// part newest first. Pure: main.ts reads the host and draws.

export const SUFFIX = '.tam.json'
/** The one name 0.1 and 0.2 gave every chat's page. */
export const LEGACY = 'page.tam.json'
/** Where pages kept on this device live in the App's data; 0.2 kept its single one at LEGACY. */
export const LOCAL_DIR = 'pages'

export interface Note {
  /** A chat file's id, or the App-data path of a page on this device. */
  key: string
  /** The chat it is in; null: only on this device. */
  chat: string | null
  name: string
  /** The chat's name as people know it (a private chat: the other one in it); empty on this device. */
  where: string
  /** ISO time of the last change, when known. */
  at: string | null
}

/** The place a list is opened from: a chat's id, or null on its own (this device). */
export type Here = string | null

/** The pages of `here` first, then the rest; each part newest first. */
export function ordered(notes: readonly Note[], here: Here): Note[] {
  const newest = [...notes].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  return [...newest.filter((n) => n.chat === here), ...newest.filter((n) => n.chat !== here)]
}

/** What a list row calls a page: its name without the suffix. */
export function titleOf(name: string): string {
  return name.endsWith(SUFFIX) ? name.slice(0, -SUFFIX.length) : name
}

/** A name nobody chose: 0.2's `page.tam.json`, or the time a new page was made at (`11-19 21.40.tam.json`, ` 2`…). */
export function isDefaultName(name: string): boolean {
  return name === LEGACY || /^\d\d-\d\d \d\d\.\d\d( \d+)?\.tam\.json$/.test(name)
}

/**
 * A page's name from a title, unique among `taken` (names in the same chat, any case). The host would add 「 (2)」 itself,
 * but before the last dot only — `x.tam (2).json` — and then nothing claims the file; so the App never lets it.
 */
export function uniqueName(title: string, taken: Iterable<string>): string {
  const clean = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30).trim() || 'page'
  const used = new Set([...taken].map((n) => n.toLowerCase()))
  for (let i = 1; ; i++) {
    const name = `${clean}${i === 1 ? '' : ` ${i}`}${SUFFIX}`
    if (!used.has(name.toLowerCase())) return name
  }
}

/** A new page's name: the minute it was made. */
export function newName(at: Date, taken: Iterable<string>): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return uniqueName(`${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}.${pad(at.getMinutes())}`, taken)
}

/** The first line with words on it: what a page left under a default name is named after. */
export function firstLine(text: string): string {
  return text.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
}
