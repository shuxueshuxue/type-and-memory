// The two pages under comparison, each given the same text and notes.
// new: this repo's standalone page, the document seeded into its localStorage.
// old: Ink & Memory's frontend built unmodified, its backend answered by stubs in the browser.
export const NEW = process.env.NEW_URL ?? 'http://localhost:4320/'
export const OLD = process.env.OLD_URL ?? 'http://localhost:4321/ink-and-memory/'
export const editable = { new: '.tm-text[contenteditable="true"]', old: 'textarea' }

const VOICES = [['Mirror', 'mirror', 'eye', 'green', 150], ['Holder', 'holder', 'heart', 'pink', 340], ['Weaver', 'weaver', 'compass', 'purple', 265], ['Starter', 'starter', 'fist', 'yellow', 40], ['Absurdist', 'absurdist', 'masks', 'blue', 15]]

/** notes: [{ quote, note }] in the order they were made. */
export async function seed(page, arm, text, notes) {
  if (arm === 'new') {
    const marks = notes.map((n, i) => ({ id: `m${i}`, quote: n.quote, note: n.note, voice: VOICES[i % 5][0], hue: VOICES[i % 5][4], at: i + 1, ...(n.thread ? { thread: n.thread } : {}) }))
    await page.addInitScript((doc) => localStorage.setItem('type-and-memory', doc), JSON.stringify({ text, marks }))
    return
  }
  const state = {
    id: 'current-session', selectedState: 'ok', createdAt: new Date().toISOString(),
    cells: [{ id: 'c1', type: 'text', content: text }],
    commentors: notes.map((n, i) => ({ id: `m${i}`, phrase: n.quote, comment: n.note, voiceId: VOICES[i % 5][1], voice: VOICES[i % 5][0], icon: VOICES[i % 5][2], color: VOICES[i % 5][3], appliedAt: i + 1, computedAt: i + 1, textSnapshot: '' })),
    tasks: [], weightPath: [], overlappedPhrases: [], notFoundPhrases: [],
  }
  await page.addInitScript(() => { localStorage.setItem('auth_token', 'stub'); localStorage.setItem('migration_completed', 'true') })
  await page.route('**/ink-and-memory/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/ink-and-memory', '')
    if (!path.startsWith('/api') && !path.startsWith('/polycli')) return route.continue()
    const json = (body) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/api/me') return json({ id: 1, email: 'a@b.c', display_name: 'w', first_login_completed: true })
    if (path === '/api/sessions' || path === '/api/sessions/range') return route.request().method() === 'GET' ? json({ sessions: [{ id: 'current-session', updated_at: new Date().toISOString() }] }) : json({ success: true })
    if (path === '/api/sessions/current-session') return json({ id: 'current-session', editor_state: state })
    if (path === '/polycli/api/trigger-sync') return json({ success: true, result: { voices: [], new_voices_added: 0 } })
    return json({ sessions: [], pictures: [], decks: [], friends: [], requests: [], reports: [] })
  })
}

/** Ink & Memory asks for a mood before it lets you write. */
export async function enter(page, arm) {
  if (arm === 'old' && (await page.getByText('Click a state to begin writing').count())) await page.getByText('OK', { exact: true }).click()
}
