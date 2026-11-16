import { describe, expect, it } from 'vitest'
import { openDesk, type Sheet } from '../src/core/desk'
import { createEnergy } from '../src/core/pace'
import { find, weigh } from '../src/core/text'
import { DeskError, type Mark } from '../src/core/types'
import { parseSidecar, writeSidecar } from '../src/stores/sidecar'

function sheetOf(text: string) {
  const marks = new Map<string, Mark>()
  const sheet: Sheet = {
    text: () => text,
    marks: () => [...marks.values()],
    put: (m) => void marks.set(m.id, m),
    drop: (id) => void marks.delete(id),
  }
  return { sheet, marks }
}

describe('desk', () => {
  it('pins a note to the phrase as written, forgiving typographic quotes', () => {
    const { sheet } = sheetOf('I said “fine” and smiled. It was not fine.')
    const mark = openDesk(sheet).annotate({ quote: '"FINE" and smiled', note: 'Was it?' })
    expect(mark.quote).toBe('“fine” and smiled')
  })

  it('tells the agent why a quote was refused', () => {
    const { sheet } = sheetOf('要保持风度。输了才他妈输了呢。')
    const desk = openDesk(sheet)
    desk.annotate({ quote: '保持风度', note: '为谁保持？' })
    expect(() => desk.annotate({ quote: '要保持', note: 'x' })).toThrow(/overlaps/)
    expect(() => desk.annotate({ quote: '体面', note: 'x' })).toThrow(/not in the text/)
    expect(() => desk.annotate({ quote: '风度。\n输了', note: 'x' })).toThrow(DeskError)
  })

  it('takes the next free occurrence of a repeated phrase', () => {
    const { sheet, marks } = sheetOf('again and again')
    const desk = openDesk(sheet)
    desk.annotate({ quote: 'again', note: 'one' })
    desk.annotate({ quote: 'again', note: 'two' })
    expect(marks.size).toBe(2)
    expect(() => desk.annotate({ quote: 'again', note: 'three' })).toThrow(/overlaps/)
  })

  it('keeps one whisper and threads replies under a note', () => {
    const { sheet, marks } = sheetOf('text')
    const desk = openDesk(sheet, [{ id: 'mirror', name: 'Mirror', hue: 150 }])
    desk.annotate({ note: 'first' })
    desk.annotate({ note: 'second', as: 'mirror' })
    expect([...marks.values()].map((m) => [m.note, m.voice, m.hue])).toEqual([['second', 'Mirror', 150]])
    const id = [...marks.keys()][0]!
    desk.reply({ mark: id, text: 'because' })
    expect(marks.get(id)!.thread).toMatchObject([{ from: 'Mirror', text: 'because' }])
    expect(() => desk.reply({ mark: 'nope', text: 'x' })).toThrow(/no note/)
  })
})

describe('energy', () => {
  it('shows a note per cost earned and carries the remainder', () => {
    const energy = createEnergy({ cost: 50 })
    energy.earn(49)
    expect(energy.canShow()).toBe(false)
    energy.earn(71)
    expect([energy.level(), energy.progress()]).toEqual([2, 0.4])
    energy.show()
    energy.show()
    expect(energy.canShow()).toBe(false)
    expect(energy.progress()).toBe(0.4)
  })

  it('asks at a clause when something changed, not while a fetched note waits', () => {
    const energy = createEnergy()
    expect(energy.shouldAsk(0)).toBe(false)
    energy.earn(6)
    expect(energy.shouldAsk(1)).toBe(false)
    expect(energy.shouldAsk(0)).toBe(true)
    energy.asked()
    expect(energy.shouldAsk(0)).toBe(false)
    energy.earn(60)
    energy.show()
    expect(energy.shouldAsk(0)).toBe(true)
  })

  it('with a stride, asks once per stride earned', () => {
    const energy = createEnergy({ cost: 50, stride: 50 })
    energy.earn(30)
    expect(energy.shouldAsk(0)).toBe(false)
    energy.earn(30)
    expect(energy.shouldAsk(0)).toBe(true)
    energy.asked()
    energy.earn(20)
    expect(energy.shouldAsk(0)).toBe(false)
  })

  it('counts notes already on an opened page as paid for', () => {
    const energy = createEnergy()
    energy.restore(130, 2)
    expect([energy.level(), energy.progress()]).toEqual([0, 0.6])
    energy.restore(10, 2)
    expect(energy.canShow()).toBe(false)
  })
})

describe('text', () => {
  it('weighs CJK double and sentence ends heavier', () => {
    expect(weigh('ab')).toBe(2)
    expect(weigh('你好')).toBe(4)
    expect(weigh('好。')).toBe(6)
    expect(weigh('好，')).toBe(2)
  })
  it('finds from an offset', () => {
    expect(find('a—b a-b', 'a-b', 1)).toBe(4)
  })
})

describe('sidecar', () => {
  it('leaves a page without notes as the plain file and round-trips one with notes', () => {
    expect(writeSidecar({ text: 'just text\n', marks: [] })).toBe('just text\n')
    const doc = { text: 'a line\n\nanother', marks: [{ id: 'a', quote: 'line', note: 'n', voice: 'Mirror', hue: 150, at: 1 }] }
    expect(parseSidecar(writeSidecar(doc))).toEqual(doc)
    expect(parseSidecar('no block %% here')).toEqual({ text: 'no block %% here', marks: [] })
  })
})
