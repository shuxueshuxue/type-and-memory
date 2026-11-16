import { describe, expect, it } from 'vitest'
import { carry, dataStore, joined, type Target } from '../hosts/gugu/alone'

/** A chat page as the carry sees it; `fail` breaks one step. */
function page(start: string, fail?: 'save' | 'reread' | 'lost') {
  let text = start
  const target: Target = {
    text: () => text,
    write: (next) => {
      text = next
    },
    saved: () => (fail === 'save' ? Promise.reject(new Error('offline')) : Promise.resolve()),
    reread: async () => {
      if (fail === 'reread') throw new Error('not found')
      return fail === 'lost' ? start : text
    },
  }
  return { target, now: () => text }
}

describe('carrying the page written on this device into a chat', () => {
  it('fills an empty chat page with the text, then drops the device copy', async () => {
    const chat = page('')
    let dropped = false
    await carry('第一行\n第二行', chat.target, async () => void (dropped = true))
    expect(chat.now()).toBe('第一行\n第二行')
    expect(dropped).toBe(true)
  })

  it('puts the text after what the chat page already holds, one blank line between', async () => {
    const chat = page('原来的字\n\n')
    let dropped = false
    await carry('新写的', chat.target, async () => void (dropped = true))
    expect(chat.now()).toBe('原来的字\n\n新写的')
    expect(dropped).toBe(true)
    expect(joined('', 'x')).toBe('x')
    expect(joined('a', 'x')).toBe('a\n\nx')
  })

  it.each(['save', 'reread', 'lost'] as const)('keeps the device copy when the chat %s step fails', async (fail) => {
    const chat = page('', fail)
    let dropped = false
    await expect(carry('写好的字', chat.target, async () => void (dropped = true))).rejects.toThrow()
    expect(dropped).toBe(false)
  })

  it('drops an empty device page without touching the chat page', async () => {
    const chat = page('原来的字')
    let dropped = false
    await carry('  ', chat.target, async () => void (dropped = true))
    expect(chat.now()).toBe('原来的字')
    expect(dropped).toBe(true)
  })
})

describe('the page on this device', () => {
  it('keeps page.tam.json’s shape, and saves nothing once retired', async () => {
    const files = new Map<string, string>()
    const store = dataStore({ read: async (p) => files.get(p) ?? null, write: async (p, c) => void files.set(p, c) }, 'page.tam.json')
    expect(await store.load()).toBeNull()
    await store.save({ text: '你好', marks: [] })
    expect(JSON.parse(files.get('page.tam.json')!)).toEqual({ v: 1, text: '你好', marks: {} })
    expect(await store.load()).toEqual({ text: '你好', marks: [] })
    await store.retire()
    await store.save({ text: '迟到的保存', marks: [] })
    expect(JSON.parse(files.get('page.tam.json')!).text).toBe('你好')
  })
})
