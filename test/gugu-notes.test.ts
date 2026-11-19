import { describe, expect, it } from 'vitest'
import { firstLine, isDefaultName, newName, ordered, titleOf, uniqueName, type Note } from '../hosts/gugu/notes'

const note = (key: string, chat: string | null, at: string): Note => ({ key, chat, name: `${key}.tam.json`, where: chat ?? '', at })
const ALL = [
  note('g1', 'group', '2026-11-19T10:00:00Z'),
  note('d1', 'dm', '2026-11-19T12:00:00Z'),
  note('l1', null, '2026-11-19T11:00:00Z'),
  note('g2', 'group', '2026-11-18T10:00:00Z'),
  note('d2', 'dm', '2026-11-16T10:00:00Z'),
]
const keys = (list: Note[]) => list.map((n) => n.key)

describe('one list, ordered by where it is opened', () => {
  it('puts the group pages first when opened in the group, the rest newest first', () => {
    expect(keys(ordered(ALL, 'group'))).toEqual(['g1', 'g2', 'd1', 'l1', 'd2'])
  })
  it('puts the private chat pages first when opened there: the same pages, another order', () => {
    expect(keys(ordered(ALL, 'dm'))).toEqual(['d1', 'd2', 'l1', 'g1', 'g2'])
  })
  it('puts the pages on this device first when opened on its own', () => {
    expect(keys(ordered(ALL, null))).toEqual(['l1', 'd1', 'g1', 'g2', 'd2'])
  })
  it('keeps a page with no time at the end of its part', () => {
    expect(keys(ordered([{ ...note('x', 'group', ''), at: null }, ...ALL], 'group'))).toEqual(['g1', 'g2', 'x', 'd1', 'l1', 'd2'])
  })
})

describe('page names', () => {
  it('names a page by its title, unique in its chat whatever the case, never letting the host add (2) before .json', () => {
    expect(uniqueName('周会想法', [])).toBe('周会想法.tam.json')
    expect(uniqueName('周会想法', ['周会想法.tam.json', '周会想法 2.tam.json'])).toBe('周会想法 3.tam.json')
    expect(uniqueName('Notes', ['notes.TAM.json'])).toBe('Notes 2.tam.json')
  })
  it('keeps a title a file name can hold: no slashes, one line, at most 30 characters', () => {
    expect(uniqueName('a/b\\c: d\n', [])).toBe('a b c d.tam.json')
    expect(titleOf(uniqueName('长'.repeat(40), []))).toHaveLength(30)
    expect(uniqueName('   ', [])).toBe('page.tam.json')
  })
  it('tells a name nobody chose from one somebody did', () => {
    const made = newName(new Date(2026, 10, 19, 21, 40), [])
    expect(made).toBe('11-19 21.40.tam.json')
    expect(isDefaultName(made)).toBe(true)
    expect(isDefaultName(newName(new Date(2026, 10, 19, 21, 40), [made]))).toBe(true)
    expect(isDefaultName('page.tam.json')).toBe(true)
    expect(isDefaultName('周会想法.tam.json')).toBe(false)
  })
  it('takes the first line with words as the name to give', () => {
    expect(firstLine('\n\n  语音笔记要不要进群  \n正文')).toBe('语音笔记要不要进群')
    expect(firstLine('  \n ')).toBe('')
  })
})
