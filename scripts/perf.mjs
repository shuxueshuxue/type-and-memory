// The same ruler for this page and for Ink & Memory's writing view (its
// frontend built unmodified, its backend answered by stubs in the browser).
//   node scripts/perf.mjs new|old <chars> [rounds]
// Prints one JSON line per round: load to editable, per-keystroke main-thread
// time, keydown-to-frame latency, heap.
import { launch } from './browser.mjs'

const [arm, chars = '0', rounds = '3'] = process.argv.slice(2)
const size = Number(chars)
const NEW = process.env.NEW_URL ?? 'http://localhost:4320/'
const OLD = process.env.OLD_URL ?? 'http://localhost:4321/ink-and-memory/'
const KEYS = 'the quick brown fox. jumps over the lazy dog. and again. '

// A page of Chinese prose in paragraphs of about 120 characters, with eight phrases worth a note.
const sentence = '我明明想抓住她的肩膀问清楚到底哪里不够好，但那样就输了，对吗？'
const lines = []
const phrases = []
for (let n = 0, i = 0; n < size; i++) {
  const tag = `第${i}段`
  let line = tag
  while (line.length < 120) line += sentence
  lines.push(line)
  n += line.length + 1
}
for (let k = 0; k < Math.min(8, lines.length); k++) phrases.push(`第${Math.floor((k * lines.length) / 8)}段`)
const text = lines.join('\n')

const browser = await launch()
for (let round = 0; round < Number(rounds); round++) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(180_000)
  if (process.env.DEBUG_SHOT) {
    page.on('console', (m) => console.log('console:', m.text().slice(0, 300)))
    page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 300)))
    page.on('requestfailed', (r) => console.log('failed:', r.url()))
  }

  if (arm === 'new') {
    const marks = phrases.map((quote, i) => ({ id: `m${i}`, quote, note: '这句话你写了很多遍。', voice: 'Mirror', hue: 150, at: i }))
    await page.addInitScript((doc) => localStorage.setItem('type-and-memory', doc), JSON.stringify({ text, marks }))
  } else {
    const state = {
      id: 'current-session', selectedState: 'ok', createdAt: new Date().toISOString(),
      cells: [{ id: 'c1', type: 'text', content: text }],
      commentors: phrases.map((phrase, i) => ({ id: `m${i}`, phrase, comment: '这句话你写了很多遍。', voiceId: 'mirror', voice: 'Mirror', icon: 'eye', color: 'green', appliedAt: 1, computedAt: 1, textSnapshot: '' })),
      tasks: [], weightPath: [], overlappedPhrases: [], notFoundPhrases: [],
    }
    await page.addInitScript(() => { localStorage.setItem('auth_token', 'stub'); localStorage.setItem('migration_completed', 'true') })
    await page.route('**/ink-and-memory/**', (route) => {
      const url = new URL(route.request().url())
      if (process.env.DEBUG_SHOT) console.log('route', route.request().method(), url.pathname)
      const path = url.pathname.replace('/ink-and-memory', '')
      if (!path.startsWith('/api') && !path.startsWith('/polycli')) return route.continue()
      const json = (body) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
      if (path === '/api/me') return json({ id: 1, email: 'a@b.c', display_name: 'w', first_login_completed: true })
      if (path === '/api/sessions' || path === '/api/sessions/range') return route.request().method() === 'GET' ? json({ sessions: [{ id: 'current-session', updated_at: new Date().toISOString() }] }) : json({ success: true })
      if (path === '/api/sessions/current-session') return json({ id: 'current-session', editor_state: state })
      if (path === '/polycli/api/trigger-sync') return json({ success: true, result: { voices: [], new_voices_added: 0 } })
      if (path === '/api/decks') return json({ decks: [] })
      return json({ sessions: [], pictures: [], decks: [], friends: [], requests: [], reports: [] })
    })
  }
  const editable = arm === 'new' ? '.tm-text[contenteditable="true"]' : 'textarea'

  // Loaded means the stored text is on the page and a frame with it has been produced.
  // The clock is read inside the page, so driver round-trips are not in the number.
  await page.addInitScript(([sel, want]) => {
    const check = () => {
      const e = document.querySelector(sel)
      if (!e || ((e.value ?? e.textContent) || '').length < want) return setTimeout(check, 2)
      requestAnimationFrame(() => setTimeout(() => (window.__loaded = performance.now()), 0))
    }
    check()
  }, [editable, Math.floor(text.length * 0.9)])
  await page.goto(arm === 'new' ? NEW : OLD, { waitUntil: 'commit' })
  if (process.env.DEBUG_SHOT) {
    await page.waitForTimeout(4000)
    await page.screenshot({ path: process.env.DEBUG_SHOT })
    console.log(await page.evaluate(() => [...document.querySelectorAll('textarea')].map((t) => t.value.length)))
  }
  await page.waitForFunction(() => window.__loaded)
  const load = await page.evaluate(() => window.__loaded)
  const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null)

  // Ink & Memory asks for a mood before it lets you write.
  if (arm === 'old' && (await page.getByText('Click a state to begin writing').count())) await page.getByText('OK', { exact: true }).click()
  if (process.env.EXTRA_CSS) await page.addStyleTag({ content: process.env.EXTRA_CSS })
  await page.click(editable)
  await page.keyboard.press('Control+End')
  await page.evaluate(() => {
    window.__lat = []
    addEventListener('keydown', () => {
      const t0 = performance.now()
      requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => window.__lat.push(performance.now() - t0); c.port2.postMessage(0) })
    }, true)
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
  await page.waitForTimeout(500)
  const before = await metrics()
  const started = Date.now()
  await page.keyboard.type(KEYS, { delay: 30 })
  await page.evaluate((n) => new Promise((r) => { const wait = () => (window.__lat.length >= n ? r() : setTimeout(wait, 20)); wait() }), KEYS.length)
  const wall = Date.now() - started
  await page.waitForTimeout(300)
  const after = await metrics()
  const lat = (await page.evaluate(() => window.__lat)).sort((a, b) => a - b)
  const per = (name) => +(((after[name] - before[name]) * 1000) / KEYS.length).toFixed(2)
  console.log(JSON.stringify({
    arm, chars: text.length, round,
    loadMs: Math.round(load), fcpMs: fcp && Math.round(fcp),
    taskMsPerKey: per('TaskDuration'), scriptMsPerKey: per('ScriptDuration'), layoutMsPerKey: per('LayoutDuration'), styleMsPerKey: per('RecalcStyleDuration'),
    frameP50: +lat[Math.floor(lat.length / 2)].toFixed(1), frameP95: +lat[Math.floor(lat.length * 0.95)].toFixed(1),
    typedInMs: wall, heapMB: +(after.JSHeapUsedSize / 1048576).toFixed(1), domNodes: after.Nodes,
  }))
  await context.close()
}
await browser.close()
