// Where each note's phrase sits on the paper, and the wash of colour over it.
// Highlights are CSS Custom Highlights: ranges handed to the browser, no DOM
// change, no layout.

import { locate } from '../core/anchor'
import type { Mark } from '../core/types'
import { pointIn, type Change, type Surface } from './surface'

interface Pin {
  p: HTMLElement
  start: number
  end: number
  range: Range
}

let instances = 0

// @@@marker - a highlight pseudo-element cannot have a shape, but it can have
// an underline, and underlines are painted beneath the glyphs: a thick one
// pulled up under the lower half of the line reads as a stroke of marker pen.
const marker = (color: string) =>
  `text-decoration:underline ${color};text-decoration-thickness:.58em;text-underline-offset:-.4em;text-decoration-skip-ink:none`

export function createMarks(surface: Surface, root: HTMLElement) {
  const name = `tm${++instances}`
  const pins = new Map<string, Pin>()
  const hues = new Set<number>()
  const sheet = document.createElement('style')
  const activeRule = document.createElement('style')
  root.append(sheet, activeRule)
  let marks: Mark[] = []
  let active: string | null = null
  const paint = 'highlights' in CSS

  const pin = (p: HTMLElement, start: number, end: number): Pin => {
    const range = document.createRange()
    range.setStart(...pointIn(p, start))
    range.setEnd(...pointIn(p, end))
    return { p, start, end, range }
  }

  /** Find every phrase again in the whole text. */
  function relocate() {
    pins.clear()
    const spans = [...locate(surface.read(), marks)].sort((a, b) => a[1][0] - b[1][0])
    let p = surface.element.firstChild as HTMLElement | null
    let base = 0
    for (const [id, [start, end]] of spans) {
      while (p && start > base + (p.textContent?.length ?? 0)) {
        base += (p.textContent?.length ?? 0) + 1
        p = p.nextSibling as HTMLElement | null
      }
      if (p) pins.set(id, pin(p, start - base, end - base))
    }
    wash()
  }

  // @@@local-first - typing in a line only re-finds the phrases pinned to that
  // line; the whole text is searched again only when one of them went missing
  // (cut, or moved to another line by Enter or a join).
  function follow({ changed, structural }: Change) {
    const adrift = marks.filter((m) => m.quote && !pins.has(m.id))
    const here = marks.filter((m) => {
      const at = pins.get(m.id)
      return at && (changed.has(at.p) || !at.p.isConnected)
    })
    if (!here.length && !adrift.length) return
    const lineOf = new Map(here.map((m) => [m, pins.get(m.id)!.p]))
    let lost = here.some((m) => !lineOf.get(m)!.isConnected)
    // A phrase that went missing is looked for again in every line that changes: undo brings it back there.
    for (const p of changed) {
      const group = [...here.filter((m) => lineOf.get(m) === p), ...adrift.filter((m) => !pins.has(m.id))]
      if (!group.length) continue
      const spans = locate(p.textContent ?? '', group)
      for (const m of group) {
        const span = spans.get(m.id)
        if (span) pins.set(m.id, pin(p, span[0], span[1]))
        else if (pins.delete(m.id)) lost = true
      }
    }
    if (lost || (structural && pins.size < quoted())) relocate()
    else wash()
  }
  const quoted = () => marks.reduce((n, m) => n + (m.quote ? 1 : 0), 0)

  function wash() {
    if (!paint) return
    const byHue = new Map<number, Range[]>()
    for (const m of marks) {
      const at = pins.get(m.id)
      if (!at) continue
      byHue.set(m.hue, [...(byHue.get(m.hue) ?? []), at.range])
      if (!hues.has(m.hue)) {
        hues.add(m.hue)
        sheet.textContent +=
          `.tm-text p::highlight(${name}-${m.hue}){${marker(`hsl(${m.hue} 90% 84%)`)}}` +
          `.tm-dark .tm-text p::highlight(${name}-${m.hue}){${marker(`hsl(${m.hue} 50% 30%)`)}}`
      }
    }
    for (const hue of hues) {
      const ranges = byHue.get(hue)
      if (ranges) CSS.highlights.set(`${name}-${hue}`, new Highlight(...ranges))
      else CSS.highlights.delete(`${name}-${hue}`)
    }
    const at = active ? pins.get(active) : undefined
    const hue = marks.find((m) => m.id === active)?.hue
    if (at) {
      const h = new Highlight(at.range)
      h.priority = 1
      CSS.highlights.set(`${name}-active`, h)
      activeRule.textContent =
        `.tm-text p::highlight(${name}-active){${marker(`hsl(${hue} 95% 72%)`)}}` +
        `.tm-dark .tm-text p::highlight(${name}-active){${marker(`hsl(${hue} 65% 42%)`)}}`
    } else CSS.highlights.delete(`${name}-active`)
  }

  surface.onChange(follow)

  return {
    set(next: Mark[]) {
      marks = next
      relocate()
    },
    pinOf: (id: string) => pins.get(id),
    /** The note whose phrase holds the caret. */
    under(p: HTMLElement, offset: number): string | null {
      for (const [id, at] of pins) if (at.p === p && offset >= at.start && offset <= at.end) return id
      return null
    },
    activate(id: string | null) {
      if (active === id) return
      active = id
      wash()
    },
    destroy() {
      if (!paint) return
      for (const hue of hues) CSS.highlights.delete(`${name}-${hue}`)
      CSS.highlights.delete(`${name}-active`)
    },
  }
}

export type Marks = ReturnType<typeof createMarks>
