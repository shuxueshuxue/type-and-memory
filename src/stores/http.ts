import type { Store } from '../core/types'

/** The page as one JSON document behind a URL: GET reads it, PUT replaces it. */
export function httpStore(url: string, fetcher: typeof fetch = fetch): Store {
  return {
    async load() {
      const res = await fetcher(url)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Could not load the page: ${res.status}`)
      return res.json()
    },
    async save(doc) {
      const body = JSON.stringify({ text: doc.text, marks: doc.marks })
      // keepalive lets the last save outlive a closing tab, but browsers cap such bodies at 64 KiB.
      const res = await fetcher(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body, keepalive: body.length < 60_000 })
      if (!res.ok) throw new Error(`the server answered ${res.status}`)
    },
  }
}
