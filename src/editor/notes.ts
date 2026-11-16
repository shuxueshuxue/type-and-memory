// The margin: one card per pinned note, each level with its phrase.

import type { Mark } from '../core/types'
import type { Marks } from './marks'

export interface NoteActions {
  reply(text: string): void
  dismiss(): void
}

/** How a note is drawn. Replace it through `parts.note`. */
export type NotePart = (mark: Mark, actions: NoteActions) => { el: HTMLElement; update(mark: Mark): void }

export const defaultNote: NotePart = (mark, actions) => {
  const el = document.createElement('article')
  el.className = 'tm-note'
  const make = (tag: string, className: string, props: object = {}): HTMLElement => Object.assign(document.createElement(tag), { className, ...props })
  const x = make('button', 'tm-x', { textContent: '×', title: 'Dismiss' })
  // Voice and note run on as one paragraph, so a note squeezed to a single line still says who and what.
  const voice = make('b', 'tm-voice')
  const say = make('span', 'tm-say')
  const body = make('p', 'tm-body')
  body.append(voice, say)
  const thread = make('div', 'tm-thread')
  const answer = make('input', 'tm-answer', { placeholder: '…' }) as HTMLInputElement
  el.append(x, body, thread, answer)
  x.onclick = () => actions.dismiss()
  el.onclick = (e) => e.target !== x && !(e.target as Element).closest('.tm-more') && answer.focus()
  answer.onkeydown = (e) => {
    if (e.key !== 'Enter' || e.isComposing || !answer.value.trim()) return
    actions.reply(answer.value.trim())
    answer.value = ''
  }
  const update = (m: Mark) => {
    el.style.setProperty('--tm-h', String(m.hue))
    voice.textContent = m.voice
    say.textContent = m.note
    el.classList.toggle('tm-threaded', !!m.thread?.length)
    thread.replaceChildren(
      ...(m.thread ?? []).map((t) => make('div', t.from === 'writer' ? 'tm-turn tm-me' : 'tm-turn', { textContent: t.text })),
    )
  }
  update(mark)
  return { el, update }
}

/** Room kept between a note and the one on the next line. */
const GAP = 5
/** The last note has nothing below it to make room for, but a margin is not a column of prose. */
const LAST = 6
/** A card's own vertical padding, allowed for when counting the lines that fit. */
const PAD = 5
/** Two phrases whose lines start within this many pixels are on the same line. */
const SAME_LINE = 6

export function createNotes(opts: {
  margin: HTMLElement
  tray: HTMLElement
  marks: Marks
  part: NotePart
  narrow: () => boolean
  actions: (id: string) => NoteActions
  onPick: (id: string) => void
}) {
  const { margin, tray, marks } = opts
  const cards = new Map<string, ReturnType<NotePart>>()
  const order = new Map<string, number>()
  /** For lines that hold several notes: which one the writer last chose to see. */
  const chosen = new Map<string, string>()
  let active: string | null = null
  let queued = false

  // @@@level - the margin never grows past the text and no note leaves its
  // line. Every note sits level with its phrase and gets the room down to the
  // next noted line: all of it if it fits, otherwise its first lines. Notes
  // that share a line share one place and take turns in it. Reading a note in
  // full (pointer over it, or the caret in its phrase) lays it over the notes
  // below instead of pushing them away.
  function place() {
    queued = false
    if (opts.narrow()) {
      const card = active ? cards.get(active) : undefined
      // A card that came from the margin still carries what it had there.
      if (card) {
        card.el.style.transform = ''
        card.el.style.removeProperty('--tm-lines')
        card.el.classList.remove('tm-behind', 'tm-lost')
        card.el.querySelector('.tm-more')?.remove()
      }
      if (card && card.el.parentNode !== tray) tray.replaceChildren(card.el)
      else if (!card) tray.replaceChildren()
      return
    }
    const rows: { id: string; el: HTMLElement; y: number }[] = []
    for (const [id, { el }] of cards) {
      if (el.parentNode !== margin) margin.append(el)
      const pin = marks.pinOf(id)
      el.classList.toggle('tm-lost', !pin)
      if (!pin) continue
      const line = pin.range.getBoundingClientRect()
      const inLine = line.height ? line.top - pin.p.getBoundingClientRect().top : 0
      rows.push({ id, el, y: pin.p.offsetTop + inLine - margin.offsetTop })
    }
    rows.sort((a, b) => a.y - b.y || order.get(a.id)! - order.get(b.id)!)
    const lines: (typeof rows)[] = []
    for (const row of rows) {
      const last = lines.at(-1)
      if (last && row.y - last[0]!.y < SAME_LINE) last.push(row)
      else lines.push([row])
    }
    const pitch = parseFloat(getComputedStyle(margin).lineHeight)
    const stacks: { rows: typeof rows; y: number }[] = []
    lines.forEach((line, i) => {
      const key = line[0]!.id
      const room = i + 1 < lines.length ? lines[i + 1]![0]!.y - line[0]!.y - GAP : LAST * (pitch + PAD)
      // Notes on one line sit one under another when each can have a line of its own before the next noted line;
      // otherwise they take turns in the one place.
      const together = line.length * (pitch + PAD) <= room
      const shown = together
        ? null
        : (line.find((r) => r.id === active) ?? line.find((r) => r.id === chosen.get(key)) ?? line.reduce((a, b) => (order.get(b.id)! > order.get(a.id)! ? b : a)))
      const each = together ? room / line.length : room
      for (const row of line) {
        row.el.classList.toggle('tm-behind', !together && row !== shown)
        row.el.style.setProperty('--tm-lines', String(Math.min(LAST, Math.max(1, Math.floor((each - PAD) / pitch)))))
        let more = row.el.querySelector<HTMLButtonElement>('.tm-more')
        if (together || line.length === 1) {
          more?.remove()
          continue
        }
        if (!more) row.el.prepend((more = Object.assign(document.createElement('button'), { className: 'tm-more' })))
        const at = line.indexOf(row)
        more.textContent = `${at + 1}/${line.length}`
        more.onclick = () => {
          const next = line[(at + 1) % line.length]!.id
          chosen.set(key, next)
          opts.onPick(next)
        }
      }
      stacks.push({ rows: together ? line : [shown!], y: line[0]!.y })
    })
    // Heights are read once, after every clamp is set, then every card is moved.
    // A card being read in full is taller than its place; it keeps the place its clamped lines would take.
    const heights = stacks.map((stack) =>
      stack.rows.map((row) =>
        row.id === active || row.el.matches(':hover') ? Number(row.el.style.getPropertyValue('--tm-lines')) * pitch + PAD : row.el.offsetHeight,
      ),
    )
    stacks.forEach((stack, i) => {
      let y = stack.y
      stack.rows.forEach((row, j) => {
        row.el.style.transform = `translateY(${y}px)`
        y += heights[i]![j]! + 2
        // Glide on later moves only; a new card appears in place.
        if (!row.el.classList.contains('tm-placed')) requestAnimationFrame(() => row.el.classList.add('tm-placed'))
      })
    })
  }
  const layout = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(place)
  }
  new ResizeObserver(layout).observe(margin)

  return {
    layout,
    sync(next: Mark[]) {
      const seen = new Set<string>()
      for (const m of next) {
        if (!m.quote) continue
        seen.add(m.id)
        const card = cards.get(m.id)
        if (card) card.update(m)
        else {
          const made = opts.part(m, opts.actions(m.id))
          made.el.addEventListener('pointerdown', (e) => !(e.target as Element).closest('.tm-more') && opts.onPick(m.id))
          cards.set(m.id, made)
          order.set(m.id, m.at + order.size / 1e6)
        }
      }
      for (const [id, card] of cards) {
        if (seen.has(id)) continue
        card.el.remove()
        cards.delete(id)
        order.delete(id)
      }
      layout()
    },
    activate(id: string | null) {
      if (active) cards.get(active)?.el.classList.remove('tm-active')
      active = id
      if (id) cards.get(id)?.el.classList.add('tm-active')
      layout()
    },
    holds: (node: Node | null) => !!node && (margin.contains(node) || tray.contains(node)),
  }
}
