// The paper: a contenteditable whose children are one <p> per line of text.
// Typing, selection, undo and IME stay the browser's own; this file only keeps
// the DOM in that one shape and reports what changed.

import { weigh } from '../core/text'

export interface Sel {
  anchor: number
  head: number
}

export interface Change {
  /** Paragraphs whose text changed and that are still on the page. */
  changed: Set<HTMLElement>
  /** Paragraphs were added or removed. */
  structural: boolean
  /** Set when the writer did it: net weight written and whether a sentence just ended. */
  typed: { weight: number; sentenceEnd: boolean } | null
}

export interface Surface {
  element: HTMLElement
  /** The whole text, lines joined by "\n". */
  read(): string
  /** Draw `text`. What `read` returns afterwards is exactly `text`. */
  render(text: string, sel?: Sel | null): void
  selection(): Sel | null
  onChange(listener: (change: Change) => void): void
  destroy(): void
}

// A clause ends where Ink & Memory cut its "completed sentences": sentence marks, the Chinese comma, a new line.
const SENTENCE_TYPED = /[.!?。！？，]$/
/** Past this many lines a paste is built directly instead of typed in line by line (which keeps native undo). */
const NATIVE_PASTE_LINES = 200

export function createSurface(placeholder: string): Surface {
  const root = document.createElement('div')
  root.className = 'tm-text'
  root.contentEditable = 'true'
  root.spellcheck = false
  root.dataset.placeholder = placeholder

  const weights = new WeakMap<Node, number>()
  const listeners: ((change: Change) => void)[] = []
  let cached: string | null = ''
  let composing = false
  let unreported = 0

  const para = (text = '', far = false) => {
    const p = document.createElement('p')
    if (far) p.className = 'tm-far'
    if (text) p.textContent = text
    else p.append(document.createElement('br'))
    return p
  }
  const paraOf = (node: Node | null): HTMLElement | null => {
    while (node && node.parentNode !== root) node = node.parentNode
    return node as HTMLElement | null
  }

  // @@@one-shape - whatever the browser leaves behind (a bare text node after
  // select-all-delete, a <div>, styled spans from merging lines) is put back
  // into plain <p> lines, keeping the caret where it was.
  function reshape(changed: Set<HTMLElement>, structural: boolean): boolean {
    let added = false
    if (structural) {
      for (const node of [...root.childNodes]) {
        if (node instanceof HTMLParagraphElement) continue
        const caret = caretWithin(node)
        const p = para(node.textContent ?? '')
        node.replaceWith(p)
        changed.add(p)
        if (caret !== null) placeCaret(p, caret)
      }
      if (!root.firstChild) {
        const p = para()
        root.append(p)
        changed.add(p)
        if (document.activeElement === root) placeCaret(p, 0)
      }
    }
    for (const p of [...changed]) {
      const kids = p.childNodes
      const text = p.textContent ?? ''
      const plain = [...kids].every((k, i) => k.nodeType === Node.TEXT_NODE || (k.nodeName === 'BR' && i === kids.length - 1))
      if (plain && kids.length && !text.includes('\n')) continue
      // Dictation and some IMEs commit several lines as one insertion.
      const [first, ...rest] = text.split('\n')
      const caret = caretWithin(p)
      p.replaceChildren(first || document.createElement('br'))
      const more = rest.map((line) => para(line))
      added ||= more.length > 0
      p.after(...more)
      for (const q of more) changed.add(q)
      if (caret === null) continue
      let at = caret
      const line = [p, ...more].find((q) => at <= (q.textContent?.length ?? 0) || ((at -= (q.textContent?.length ?? 0) + 1), false))
      placeCaret(line ?? p, line ? at : 0)
    }
    return added
  }

  function digest(records: MutationRecord[]) {
    if (!records.length) return
    const changed = new Set<HTMLElement>()
    let structural = false
    let weight = 0
    for (const r of records) {
      if (r.target === root) {
        structural = true
        for (const n of r.removedNodes) weight -= weights.get(n) ?? 0
        for (const n of r.addedNodes) if (n.parentNode === root && n instanceof HTMLElement) changed.add(n)
      } else {
        const p = paraOf(r.target)
        if (p) changed.add(p)
      }
    }
    if (!composing && reshape(changed, structural)) structural = true
    observer.takeRecords()
    for (const p of changed) {
      if (p.parentNode !== root) {
        changed.delete(p)
        continue
      }
      const w = weigh(p.textContent ?? '')
      weight += w - (weights.get(p) ?? 0)
      weights.set(p, w)
    }
    cached = null
    root.classList.toggle('tm-empty', root.childNodes.length === 1 && !root.firstChild!.textContent)
    unreported += weight
    const change: Change = { changed, structural, typed: null }
    for (const l of listeners) l(change)
  }

  // @@@typed - what changed and who typed it are reported separately. Anyone
  // may drain the mutation records first (a host's text binding calls read()
  // from its own input listener); the weight written waits here until the
  // writer's own input event claims it.
  function typed(sentenceEnd: boolean) {
    digest(observer.takeRecords())
    const change: Change = { changed: new Set(), structural: false, typed: { weight: Math.max(0, unreported), sentenceEnd } }
    unreported = 0
    for (const l of listeners) l(change)
  }

  const observer = new MutationObserver(digest)
  observer.observe(root, { childList: true, characterData: true, subtree: true })

  root.addEventListener('compositionstart', () => (composing = true))
  root.addEventListener('compositionend', (e) => {
    composing = false
    typed(SENTENCE_TYPED.test(e.data ?? ''))
  })
  root.addEventListener('input', (e) => {
    if (composing) return
    const { inputType, data } = e as InputEvent
    typed(inputType === 'insertParagraph' || SENTENCE_TYPED.test(data ?? ''))
  })
  root.addEventListener('beforeinput', (e) => {
    if (e.inputType.startsWith('format')) e.preventDefault()
    else if (e.inputType === 'insertLineBreak') {
      e.preventDefault()
      document.execCommand('insertParagraph')
    } else if (e.inputType === 'insertFromDrop') {
      e.preventDefault()
      insert(e.dataTransfer?.getData('text/plain') ?? '')
    }
  })
  root.addEventListener('paste', (e) => {
    e.preventDefault()
    insert(e.clipboardData?.getData('text/plain') ?? '')
  })

  function insert(text: string) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
    if (lines.length <= NATIVE_PASTE_LINES) {
      lines.forEach((line, i) => {
        if (i) document.execCommand('insertParagraph')
        if (line) document.execCommand('insertText', false, line)
      })
      return
    }
    const sel = selection()
    if (!sel) return
    const [from, to] = [Math.min(sel.anchor, sel.head), Math.max(sel.anchor, sel.head)]
    const now = read()
    render(now.slice(0, from) + lines.join('\n') + now.slice(to), { anchor: from + text.length, head: from + text.length })
    unreported = weigh(text)
    typed(true)
  }

  function read(): string {
    digest(observer.takeRecords())
    if (cached === null) {
      const lines: string[] = []
      for (let p = root.firstChild; p; p = p.nextSibling) lines.push(p.textContent ?? '')
      cached = lines.join('\n')
    }
    return cached
  }

  // @@@render-diff - lines equal at the head and tail keep their elements, so
  // a remote edit redraws only the lines that differ and marks on the rest hold.
  function render(text: string, sel?: Sel | null) {
    const lines = text.split('\n')
    const old = [...root.children] as HTMLElement[]
    let head = 0
    while (head < old.length && head < lines.length && old[head]!.textContent === lines[head]) head++
    let tail = 0
    while (
      tail < old.length - head &&
      tail < lines.length - head &&
      old[old.length - 1 - tail]!.textContent === lines[lines.length - 1 - tail]
    )
      tail++
    const fresh = document.createDocumentFragment()
    for (let i = head; i < lines.length - tail; i++) fresh.append(para(lines[i], true))
    for (let i = head; i < old.length - tail; i++) old[i]!.remove()
    root.insertBefore(fresh, old[old.length - tail] ?? null)
    digest(observer.takeRecords())
    // Text drawn by render was not typed here.
    unreported = 0
    if (sel) select(sel)
  }

  function selection(): Sel | null {
    const s = getSelection()
    if (!s?.anchorNode || !root.contains(s.anchorNode) || !root.contains(s.focusNode)) return null
    return { anchor: offsetOf(s.anchorNode, s.anchorOffset), head: offsetOf(s.focusNode!, s.focusOffset) }
  }

  function offsetOf(node: Node, offset: number): number {
    if (node === root) {
      let total = 0
      for (let i = 0; i < offset; i++) total += (root.childNodes[i]!.textContent?.length ?? 0) + 1
      return Math.max(0, Math.min(total, read().length))
    }
    const p = paraOf(node)!
    let total = offsetIn(p, node, offset)
    for (let q = p.previousSibling; q; q = q.previousSibling) total += (q.textContent?.length ?? 0) + 1
    return total
  }

  function select({ anchor, head }: Sel) {
    const point = (offset: number): [Node, number] => {
      let p = root.firstChild as HTMLElement
      while (p.nextSibling && offset > (p.textContent?.length ?? 0)) {
        offset -= (p.textContent?.length ?? 0) + 1
        p = p.nextSibling as HTMLElement
      }
      return pointIn(p, offset)
    }
    getSelection()?.setBaseAndExtent(...point(anchor), ...point(head))
  }

  // @@@far - lines drawn by render carry content-visibility:auto, so a long
  // page lays out only what is on screen. Chromium, splitting such a line on
  // Enter, starts the new one with a stray no-break space; a line gives the
  // optimisation up the moment the caret enters it, before any key can land.
  const near = () => {
    const s = getSelection()
    if (!s?.focusNode || !root.contains(s.focusNode)) return
    paraOf(s.focusNode)?.classList.remove('tm-far')
    if (!s.isCollapsed) paraOf(s.anchorNode)?.classList.remove('tm-far')
  }
  document.addEventListener('selectionchange', near)

  root.append(para())
  observer.takeRecords()
  root.classList.add('tm-empty')

  return {
    element: root,
    read,
    render,
    selection,
    onChange: (l) => void listeners.push(l),
    destroy() {
      observer.disconnect()
      document.removeEventListener('selectionchange', near)
    },
  }
}

/** Text offset of a DOM point inside paragraph `p`. */
export function offsetIn(p: HTMLElement, node: Node, offset: number): number {
  if (node === p) {
    let total = 0
    for (let i = 0; i < offset; i++) total += p.childNodes[i]!.textContent?.length ?? 0
    return total
  }
  let total = offset
  for (let n = node.previousSibling; n; n = n.previousSibling) total += n.textContent?.length ?? 0
  return total
}

/** DOM point for a text offset inside paragraph `p`. */
export function pointIn(p: HTMLElement, offset: number): [Node, number] {
  for (let n = p.firstChild; n; n = n.nextSibling) {
    if (n.nodeType !== Node.TEXT_NODE) continue
    const len = (n as Text).length
    if (offset <= len) return [n, offset]
    offset -= len
  }
  return [p, 0]
}

/** Offset of the caret inside `node`'s text, or null when the caret is elsewhere. */
function caretWithin(node: Node): number | null {
  const s = getSelection()
  if (!s?.focusNode || !(node === s.focusNode || node.contains(s.focusNode))) return null
  const r = document.createRange()
  r.selectNodeContents(node)
  r.setEnd(s.focusNode, s.focusOffset)
  return r.toString().length
}

function placeCaret(p: HTMLElement, offset: number) {
  getSelection()?.collapse(...pointIn(p, offset))
}
