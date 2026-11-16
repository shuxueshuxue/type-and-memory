// Pure text helpers shared by the page, the agents and the tests.

const SENTENCE_END = /[.!?。！？\n]/
const CJK = /[぀-ヿ㐀-鿿]/

/** How much writing a string represents: a sentence end 4, a CJK character 2, a Chinese comma nothing, anything else 1. */
export function weigh(text: string): number {
  let w = 0
  for (const ch of text) w += SENTENCE_END.test(ch) ? 4 : ch === '，' ? 0 : CJK.test(ch) ? 2 : 1
  return w
}

export function endsSentence(text: string): boolean {
  return SENTENCE_END.test(text.slice(-1))
}

// @@@fold - models retype quotes with curly quotes and long dashes swapped for
// plain ones. Every replacement is one char for one char, so an index in the
// folded string is the same index in the original. toLowerCase is not (İ grows),
// so texts where it would change the length are only quote-folded.
export function fold(text: string): string {
  const lower = text.toLowerCase()
  return (lower.length === text.length ? lower : text)
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
}

/** Index of `quote` in `text`, forgiving case and typographic punctuation. -1 if absent. */
export function find(text: string, quote: string, from = 0): number {
  return quote ? fold(text).indexOf(fold(quote), from) : -1
}

export function hueOf(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  // Skip the muddy yellow-green band; it reads as a stain on paper.
  const hue = h % 300
  return hue < 60 ? hue : hue + 60
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}
