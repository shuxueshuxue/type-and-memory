import { fold } from './text'
import type { Mark } from './types'

export type Span = readonly [start: number, end: number]

/** First occurrence of `quote` that touches none of `taken`. -1: not in the text. -2: only where taken. */
export function firstFree(text: string, quote: string, taken: Span[]): number {
  return firstFreeFolded(fold(text), fold(quote), taken)
}

function firstFreeFolded(text: string, quote: string, taken: Span[]): number {
  let at = quote ? text.indexOf(quote) : -1
  if (at < 0) return -1
  const clash = (i: number) => taken.some(([a, b]) => i < b && i + quote.length > a)
  while (at >= 0 && clash(at)) at = text.indexOf(quote, at + 1)
  return at < 0 ? -2 : at
}

/**
 * Where each mark's phrase sits in the text, oldest mark first so a repeated
 * phrase keeps its notes on the same occurrences. A mark whose phrase is gone
 * is simply absent; it comes back if the phrase does.
 */
export function locate(text: string, marks: Mark[]): Map<string, Span> {
  const spans = new Map<string, Span>()
  const taken: Span[] = []
  const folded = fold(text)
  for (const m of [...marks].sort((a, b) => a.at - b.at)) {
    if (!m.quote) continue
    const at = firstFreeFolded(folded, fold(m.quote), taken)
    if (at < 0) continue
    const span = [at, at + m.quote.length] as const
    spans.set(m.id, span)
    taken.push(span)
  }
  return spans
}
