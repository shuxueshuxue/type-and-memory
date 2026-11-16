import { type Desk, DeskError, type Mark, type Voice } from './types'
import { hueOf, newId } from './text'
import { firstFree, locate } from './anchor'

/** The page as a desk sees it. The browser page backs this with its DOM, a tool process with a file. */
export interface Sheet {
  text(): string
  marks(): Mark[]
  put(mark: Mark): void
  drop(id: string): void
}

const MAX_QUOTE = 80

export function openDesk(sheet: Sheet, voices: Voice[] = [], now: () => number = Date.now): Desk {
  const speaker = (as?: string) => {
    const key = as?.trim().toLowerCase()
    const known = key ? voices.find((v) => v.id.toLowerCase() === key || v.name.toLowerCase() === key) : voices[0]
    const name = known?.name ?? as?.trim() ?? 'agent'
    return { name, hue: known?.hue ?? hueOf(known?.id ?? name) }
  }

  return {
    read: () => ({ text: sheet.text(), marks: sheet.marks() }),

    annotate({ quote, note, as }) {
      note = note?.trim()
      if (!note) throw new DeskError('The note is empty.')
      const live = sheet.marks()
      const voice = speaker(as)
      const mark: Mark = { id: newId(), quote: '', note, voice: voice.name, hue: voice.hue, at: now() }

      if (!quote?.trim()) {
        // One whisper at a time: a new one replaces the old.
        for (const m of live) if (!m.quote) sheet.drop(m.id)
        sheet.put(mark)
        return mark
      }

      quote = quote.trim()
      if (quote.includes('\n')) throw new DeskError('Quote a phrase from a single line.')
      if (quote.length > MAX_QUOTE) throw new DeskError(`Quote a shorter phrase (at most ${MAX_QUOTE} characters).`)
      const text = sheet.text()
      const taken = [...locate(text, live).values()]
      const at = firstFree(text, quote, taken)
      if (at === -1) throw new DeskError(`"${quote}" is not in the text. Quote a phrase exactly as written.`)
      if (at === -2) throw new DeskError(`"${quote}" overlaps a phrase that already has a note. Pick another phrase.`)

      mark.quote = text.slice(at, at + quote.length)
      sheet.put(mark)
      return mark
    },

    reply({ mark: id, text, as }) {
      text = text?.trim()
      if (!text) throw new DeskError('The reply is empty.')
      const mark = sheet.marks().find((m) => m.id === id)
      if (!mark) throw new DeskError(`There is no note "${id}". Read the page for the current notes.`)
      const from = as ? speaker(as).name : mark.voice
      sheet.put({ ...mark, thread: [...(mark.thread ?? []), { from, text, at: now() }] })
    },
  }
}
