#!/usr/bin/env node
// The optional backend, in full. It serves the built page, keeps the page in
// one JSON file, and forwards model calls with a key the browser never sees.
//
//   TAM_LLM_URL=https://api.deepseek.com/v1 TAM_LLM_KEY=… TAM_LLM_MODEL=deepseek-chat node server/server.mjs
//   TAM_LLM_EXTRA='{"thinking":{"type":"disabled"}}' adds provider-specific fields to every model call.

import { createServer } from 'node:http'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const WEB = process.env.TAM_WEB ?? join(here, '../dist/web')
const DOC = process.env.TAM_DOC ?? join(here, '../.data/page.json')
const PORT = Number(process.env.PORT ?? 4173)
const { TAM_LLM_URL, TAM_LLM_KEY, TAM_LLM_MODEL } = process.env
const EXTRA = JSON.parse(process.env.TAM_LLM_EXTRA ?? '{}')
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' }

const body = async (req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

createServer(async (req, res) => {
  const send = (status, type, data) => res.writeHead(status, type ? { 'content-type': type } : {}).end(data)
  try {
    const path = new URL(req.url, 'http://x').pathname

    if (path === '/api/doc' && req.method === 'GET') {
      return send(200, TYPES['.json'], await readFile(DOC).catch((e) => (e.code === 'ENOENT' ? 'null' : Promise.reject(e))))
    }
    if (path === '/api/doc' && req.method === 'PUT') {
      const doc = await body(req)
      JSON.parse(doc)
      await mkdir(dirname(DOC), { recursive: true })
      await writeFile(`${DOC}.tmp`, doc)
      await rename(`${DOC}.tmp`, DOC)
      return send(204)
    }
    if (path === '/api/v1/chat/completions' && req.method === 'POST') {
      if (!TAM_LLM_URL) return send(503, 'text/plain', 'No model is configured on this server (TAM_LLM_URL).')
      const asked = JSON.parse(await body(req))
      const upstream = await fetch(`${TAM_LLM_URL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(TAM_LLM_KEY ? { authorization: `Bearer ${TAM_LLM_KEY}` } : {}) },
        body: JSON.stringify({ ...asked, ...EXTRA, model: TAM_LLM_MODEL ?? asked.model }),
      })
      return send(upstream.status, upstream.headers.get('content-type') ?? TYPES['.json'], Buffer.from(await upstream.arrayBuffer()))
    }

    const file = normalize(join(WEB, path === '/' ? 'index.html' : path))
    if (!file.startsWith(WEB)) return send(403, 'text/plain', 'Forbidden')
    let data = await readFile(file)
    // The one switch between the two modes: the page reads data-backend and uses this server for storage and model.
    if (file.endsWith('index.html')) data = data.toString().replace('<html', '<html data-backend="/api"')
    send(200, TYPES[extname(file)] ?? 'application/octet-stream', data)
  } catch (error) {
    send(error.code === 'ENOENT' ? 404 : 500, 'text/plain', error.code === 'ENOENT' ? 'Not found' : String(error.message))
  }
}).listen(PORT, () => console.log(`type and memory on http://localhost:${PORT}`))
