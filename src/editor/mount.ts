import { openDesk } from '../core/desk'
import { createEnergy, type PaceOptions } from '../core/pace'
import { weigh } from '../core/text'
import type { Agent, Ask, Desk, Mark, Store, Voice } from '../core/types'
import { createMarks } from './marks'
import { createNotes, defaultNote, type NotePart } from './notes'
import { styles } from './styles'
import { createSurface, offsetIn, type Surface } from './surface'

export interface Options {
  store: Store
  agent?: Agent
  /** Who speaks in the margin. The first is the default voice. */
  voices?: Voice[]
  pace?: PaceOptions
  /** The small bar that fills as the writer earns the next note. On unless false. */
  energyBar?: boolean
  placeholder?: string
  theme?: 'light' | 'dark' | 'auto'
  parts?: { note?: NotePart }
}

export interface Page {
  /** The paper, in the four-piece shape live text bindings take: element, read, render, selection. */
  text: Pick<Surface, 'element' | 'read' | 'render' | 'selection'>
  desk: Desk
  /** Ask the agent for a look now, optionally at a phrase. */
  glance(focus?: string): void
  /** Resolves once the stored page is on screen and editable. */
  ready: Promise<void>
  destroy(): void
}

const SAVE_AFTER = 500
/** Narrower than this and notes move from the margin to a tray at the bottom. */
const NARROW = 760
/** A lull's nudge is only asked for once there is this much on the page. */
const LULL_MIN = 10

export function mount(host: HTMLElement, options: Options): Page {
  const { store } = options
  const pace = { batch: 1, lull: 2000 as number | false, ...options.pace }
  const energy = createEnergy(pace)

  if (!document.getElementById('tm-styles')) {
    document.head.append(Object.assign(document.createElement('style'), { id: 'tm-styles', textContent: styles }))
  }
  const el = (className: string, ...kids: Node[]) => {
    const d = Object.assign(document.createElement('div'), { className })
    d.append(...kids)
    return d
  }
  const surface = createSurface(options.placeholder ?? '')
  const foot = el('tm-foot')
  const margin = el('tm-margin')
  const tray = el('tm-tray')
  const scroll = el('tm-scroll', el('tm-page', el('tm-main', surface.element, foot), margin))
  const bar = el('tm-energy', el('tm-energy-fill'))
  const root = el('tm-root', scroll, tray, ...(options.energyBar === false ? [] : [bar]))
  host.append(root)

  const dark = matchMedia('(prefers-color-scheme: dark)')
  const applyTheme = () => root.classList.toggle('tm-dark', options.theme === 'dark' || (options.theme !== 'light' && dark.matches))
  applyTheme()
  dark.addEventListener('change', applyTheme)

  let narrow = root.clientWidth < NARROW
  root.classList.toggle('tm-narrow', narrow)
  const sized = new ResizeObserver(() => {
    narrow = root.clientWidth < NARROW
    root.classList.toggle('tm-narrow', narrow)
    notes.layout()
  })

  // ---- the page's own state: the text lives in the surface, the marks here.
  const marks = new Map<string, Mark>()
  const anchors = createMarks(surface, root)
  let loaded = false
  let active: string | null = null
  let heldUntil = 0

  const notes = createNotes({
    margin,
    tray,
    marks: anchors,
    part: options.parts?.note ?? defaultNote,
    narrow: () => narrow,
    onPick: (id) => activate(id),
    actions: (id) => ({
      dismiss: () => sheet.drop(id),
      reply(text) {
        const mark = marks.get(id)
        if (!mark) return
        const next = { ...mark, thread: [...(mark.thread ?? []), { from: 'writer', text, at: Date.now() }] }
        sheet.put(next)
        void ask({ kind: 'reply', mark: next, text })
      },
    }),
  })
  sized.observe(root)

  // Notes fetched ahead of the energy that pays for them: on the desk (the agent must not note the phrase twice)
  // but not yet on the page.
  const held = new Set<string>()
  let lullText: string | null = null

  const sheet = {
    text: surface.read,
    marks: () => [...marks.values()],
    put(mark: Mark) {
      // A nudge is for the pause it was asked in; if the writer has moved on, it is late.
      if (!mark.quote && lullText !== null && surface.read() !== lullText) return
      const fresh = !marks.has(mark.id)
      marks.set(mark.id, mark)
      if (fresh && mark.quote) admit(mark.id)
      marksChanged()
      save()
      flush()
    },
    drop(id: string) {
      if (!marks.delete(id)) return
      held.delete(id)
      if (active === id) activate(null)
      marksChanged()
      save()
      flush()
    },
  }
  const desk = openDesk(sheet, options.voices)
  const link = options.agent?.(desk)

  /** A new note takes its place if the writer has earned it, and waits if not. */
  function admit(id: string) {
    if (!energy.canShow()) return void held.add(id)
    energy.show()
    drawEnergy()
    requestAnimationFrame(() => announce(id))
  }
  function release() {
    let shown = false
    while (held.size && energy.canShow()) {
      // The latest waits least, as the original's waitlist did.
      const id = [...held].at(-1)!
      held.delete(id)
      energy.show()
      shown = true
      requestAnimationFrame(() => announce(id))
    }
    if (shown) marksChanged()
    return shown
  }

  function marksChanged() {
    const shown = sheet.marks().filter((m) => !held.has(m.id))
    anchors.set(shown)
    notes.sync(shown)
    drawFoot()
  }

  // In the tray a note has no place of its own, so a new one is shown for a moment.
  function announce(id: string) {
    if (!narrow) return
    heldUntil = Date.now() + 8000
    activate(id)
  }

  function activate(id: string | null) {
    if (active === id) return
    active = id
    anchors.activate(id)
    notes.activate(id)
  }

  // ---- the foot of the page: a whisper, the waiting dots, or what went wrong.
  let asking = 0
  let flash = ''
  let whisperId = ''
  function drawFoot() {
    const whisper = sheet.marks().find((m) => !m.quote)
    whisperId = whisper?.id ?? ''
    if (flash) {
      const f = el('tm-flash')
      f.textContent = flash
      f.onclick = () => ((flash = ''), drawFoot())
      foot.replaceChildren(f)
    } else if (whisper) {
      const w = el('tm-whisper', Object.assign(document.createElement('b'), { textContent: whisper.voice }), new Text(whisper.note))
      w.style.setProperty('--tm-h', String(whisper.hue))
      if (foot.firstElementChild?.textContent !== w.textContent) foot.replaceChildren(w)
    } else if (asking) {
      if (!foot.querySelector('.tm-busy')) foot.replaceChildren(el('tm-busy', ...[0, 1, 2].map(() => document.createElement('i'))))
    } else foot.replaceChildren()
  }

  let lastLevel = 0
  function drawEnergy() {
    const level = energy.level()
    const fill = bar.firstElementChild as HTMLElement
    // A level gained shows as a full bar for a beat, then the remainder.
    if (level > lastLevel) {
      fill.style.width = '100%'
      bar.classList.remove('tm-pulse')
      void bar.offsetWidth
      bar.classList.add('tm-pulse')
      setTimeout(() => (fill.style.width = `${Math.round(energy.progress() * 100)}%`), 200)
    } else fill.style.width = `${Math.round(energy.progress() * 100)}%`
    lastLevel = level
  }

  async function ask(a: Ask) {
    if (!link) return
    // Whatever the agent reads must already be what the writer sees.
    flush()
    asking++
    flash = ''
    drawFoot()
    try {
      await link.ask(a)
    } catch (error) {
      // Fail where the writer can see it; a silent margin looks like an agent with nothing to say.
      flash = error instanceof Error ? error.message : String(error)
    } finally {
      asking--
      drawFoot()
    }
  }

  // ---- saving
  let saveTimer = 0
  function save() {
    if (!loaded) return
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(flush, SAVE_AFTER)
  }
  function flush() {
    if (!saveTimer) return
    clearTimeout(saveTimer)
    saveTimer = 0
    store
      .save({
        // Lazy: a store that binds the text itself never pays for joining it.
        get text() {
          return surface.read()
        },
        marks: sheet.marks(),
      })
      .catch((error) => {
        flash = `Not saved: ${error instanceof Error ? error.message : error}`
        drawFoot()
      })
  }
  const onHide = () => document.visibilityState === 'hidden' && flush()
  document.addEventListener('visibilitychange', onHide)
  addEventListener('pagehide', flush)

  // ---- writing: the only thing the writer does. Everything the margin does follows from it.
  let lullTimer = 0
  surface.onChange(({ typed }) => {
    if (marks.size) notes.layout()
    if (!typed) return
    save()
    // An emptied page is a new page, as in the original: its notes and its energy go with the text.
    if (marks.size && !surface.read().trim()) {
      marks.clear()
      held.clear()
      activate(null)
      energy.restore(0, 0)
      marksChanged()
      flush()
    }
    energy.earn(typed.weight)
    // A nudge belongs to the pause it came in.
    if (whisperId && marks.has(whisperId)) sheet.drop(whisperId)
    lullText = null
    release()
    drawEnergy()
    if (typed.sentenceEnd) lookAhead()
    clearTimeout(lullTimer)
    if (pace.lull !== false && link) {
      lullTimer = window.setTimeout(() => {
        const text = surface.read()
        if (text.trim().length < LULL_MIN) return
        lullText = text
        void ask({ kind: 'lull' })
      }, pace.lull)
    }
  })
  /** Ask for the next note. With no stride this is at every finished clause and again each time a note is shown. */
  function lookAhead() {
    if (asking || !energy.shouldAsk(held.size) || !surface.read().trim()) return
    energy.asked()
    void ask({ kind: 'glance', want: pace.batch }).then(() => {
      // What came back may already be affordable, and with it the next look.
      if (release() || !held.size) lookAhead()
    })
  }

  const onSelect = () => {
    const s = getSelection()
    if (!s?.focusNode || notes.holds(s.focusNode)) return
    if (Date.now() < heldUntil) return
    let p: Node | null = s.focusNode
    while (p && p.parentNode !== surface.element) p = p.parentNode
    activate(p && s.isCollapsed ? anchors.under(p as HTMLElement, offsetIn(p as HTMLElement, s.focusNode, s.focusOffset)) : null)
  }
  document.addEventListener('selectionchange', onSelect)

  // The whole sheet is the writing surface: a click on its blank part puts the caret at the end of the text.
  scroll.addEventListener('mousedown', (e) => {
    if (surface.element.contains(e.target as Node) || notes.holds(e.target as Node) || surface.element.contentEditable !== 'true') return
    e.preventDefault()
    surface.element.focus()
    getSelection()?.selectAllChildren(surface.element)
    getSelection()?.collapseToEnd()
  })

  const glance = (focus?: string) => void ask({ kind: 'glance', focus: focus?.trim() || undefined })
  surface.element.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      glance(getSelection()?.toString())
    }
  })

  // ---- loading, and hearing from a store others write to
  function take(doc: { text?: string; marks?: Mark[] }) {
    if (doc.text !== undefined && doc.text !== surface.read()) surface.render(doc.text, surface.selection())
    if (doc.marks) {
      const arrived = loaded ? doc.marks.filter((m) => m.quote && !marks.has(m.id)) : []
      marks.clear()
      for (const m of doc.marks) marks.set(m.id, m)
      for (const id of held) if (!marks.has(id)) held.delete(id)
      if (active && !marks.has(active)) activate(null)
      for (const m of arrived) admit(m.id)
      if (!loaded) energy.restore(weigh(surface.read()), doc.marks.filter((m) => m.quote).length)
      marksChanged()
      drawEnergy()
    }
  }
  surface.element.contentEditable = 'false'
  let unwatch: (() => void) | undefined
  const ready = store.load().then(
    (doc) => {
      if (doc) take(doc)
      loaded = true
      surface.element.contentEditable = 'true'
      unwatch = store.watch?.(take)
    },
    (error) => {
      // Stay read-only: typing over a page that failed to load would save over it.
      flash = `Could not open the page: ${error instanceof Error ? error.message : error}`
      drawFoot()
      throw error
    },
  )

  return {
    text: surface,
    desk,
    glance,
    ready,
    destroy() {
      flush()
      unwatch?.()
      link?.close?.()
      clearTimeout(lullTimer)
      sized.disconnect()
      dark.removeEventListener('change', applyTheme)
      document.removeEventListener('visibilitychange', onHide)
      document.removeEventListener('selectionchange', onSelect)
      removeEventListener('pagehide', flush)
      anchors.destroy()
      surface.destroy()
      root.remove()
    },
  }
}
