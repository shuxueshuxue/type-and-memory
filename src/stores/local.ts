import type { Store } from '../core/types'

/** The page in this browser's localStorage. */
export function localStore(key = 'type-and-memory'): Store {
  return {
    async load() {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    },
    async save(doc) {
      localStorage.setItem(key, JSON.stringify({ text: doc.text, marks: doc.marks }))
    },
  }
}
