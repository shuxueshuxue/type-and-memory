// A page kept as one plain-text file: the text is the file, and the notes ride
// at its end in a comment block that Markdown readers (Obsidian's among them) hide.

import type { Doc } from '../core/types'

const BLOCK = /\n*%%type-and-memory\n([\s\S]*?)\n%%\s*$/

export function parseSidecar(file: string): Doc {
  const found = BLOCK.exec(file)
  if (!found) return { text: file, marks: [] }
  return { text: file.slice(0, found.index), marks: JSON.parse(found[1]!).marks }
}

export function writeSidecar(doc: Doc): string {
  if (!doc.marks.length) return doc.text
  return `${doc.text}\n\n%%type-and-memory\n${JSON.stringify({ marks: doc.marks })}\n%%\n`
}
