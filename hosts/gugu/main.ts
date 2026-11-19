// type and memory inside a 咕咕 chat. A page is one file of a chat (`*.tam.json`); the agent in the margin is an agent
// of that chat. Asking it is a whisper; what it says comes back through the tools in tools.ts, which write into the file.
//
// Every page the person has written is in one list (notes.ts): the `.tam.json` files of all their chats, found in one
// search, and the pages kept only on this device. Opened in a chat the list puts that chat's pages first; opened on its
// own (the dock, a phone's App list) it puts this device's first. A narrow panel shows the list or the page; a wide one
// both side by side.

import { mount, type Agent, type Mark, type Store } from '../../src/index'
import { carry, dataStore } from './alone'
import { firstLine, isDefaultName, LEGACY, LOCAL_DIR, newName, ordered, SUFFIX, titleOf, uniqueName, type Here, type Note } from './notes'

declare const gugu: any

const ctx = await gugu.getContext()
const zh = String(ctx.locale ?? '').startsWith('zh')
const say = (en: string, cn: string) => (zh ? cn : en)
const bare = (id: string) => String(id).replace(/^user:/, '')
const theme = ctx.themeMode === 'dark' ? 'dark' : 'light'
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Where the list was opened: the chat of the file or tab; null on its own. */
const HERE: Here = ctx.file?.chat ?? ctx.chat?.id ?? null

// The page on screen now. The toolbar is one for the tab, whichever page it shows.
let current: { note: Note; command(id: string): Promise<void> | void; text(): string; glance(focus?: string): void; close(): Promise<void> } | null = null
gugu.onCommand((id: string) => current?.command(id))


/** A chat's page file, made a page the first time it is opened. */
async function openFile(entry: any) {
  const f = await gugu.files.open(entry)
  if (f.data.v === undefined) {
    f.transact(() => {
      f.data.v = 1
      f.data.text = gugu.text('')
      f.data.marks = {}
    })
  }
  return f
}

async function openPage(entry: any, host = document.getElementById('page')!) {
  const f = await openFile(entry)
  const chat = f.entry.chat

  // ---- Store: the marks are keys of the file; the text is bound live below.
  const marksNow = (): Mark[] => Object.values(f.toJSON().marks ?? {})
  let seen = JSON.stringify(marksNow())
  let heard: (() => void) | null = null
  const store: Store = {
    load: async () => ({ marks: marksNow() }),
    async save(doc) {
      const stored = f.toJSON().marks ?? {}
      const next = new Map(doc.marks.map((m) => [m.id, m]))
      f.transact(() => {
        for (const id of Object.keys(stored)) if (!next.has(id)) delete f.data.marks[id]
        for (const [id, m] of next) if (JSON.stringify(stored[id]) !== JSON.stringify(m)) f.data.marks[id] = m
      })
      seen = JSON.stringify(marksNow())
    },
    watch: (onChange) =>
      f.onChange(() => {
        // The file changes on every letter; only a change to the marks is news to the page.
        const marks = marksNow()
        const now = JSON.stringify(marks)
        if (now === seen) return
        seen = now
        onChange({ marks })
        heard?.()
      }),
  }

  // ---- Agent: an agent of this chat. In a private chat with one, or a group with a single one, that is it.
  const agentsHere = async (): Promise<string[]> =>
    (await gugu.chats.members({ chat: chat })).members.filter((m: any) => m.kind === 'agent').map((m: any) => m.id)
  const pill = { refs: [{ file: f.entry }] }
  const WAIT = 120_000

  // The writer only writes: nobody is asked to choose. With several agents the first one reads along until the
  // toolbar button picks another.
  async function reader(): Promise<string> {
    const here = await agentsHere()
    if (!here.length) throw new Error(say('There is no agent in this chat to read along.', '这个聊天里还没有 agent 可以读这页纸。'))
    return here.includes(f.data.reader) ? f.data.reader : here[0]!
  }

  const agent: Agent = () => ({
    async ask(ask) {
      if (ask.kind === 'lull') return
      const to = ask.kind === 'reply' && ask.mark.by ? ask.mark.by : await reader()
      const many = ask.kind === 'glance' && (ask.want ?? 1) > 1
      const text =
        ask.kind === 'reply'
          ? say(`I answered your note on “${ask.mark.quote}”: ${ask.text}`, `我在你那条关于「${ask.mark.quote}」的批注下回了话：${ask.text}`)
          : ask.focus
            ? say(`Have a look at my page, at “${ask.focus}”.`, `看一眼我这页纸，尤其是「${ask.focus}」。`)
            : many
              ? say(`I wrote some more on my page. Have a look; this time up to ${ask.want} new notes, each on a phrase that has none yet.`, `我在这页纸上又写了一些，来看一眼。这一次最多新留 ${ask.want} 条批注，各钉在还没有批注的话上。`)
              : say('I wrote some more on my page. Have a look.', '我在这页纸上又写了一些，来看一眼。')
      const answered = new Promise<void>((resolve) => {
        heard = resolve
        setTimeout(resolve, WAIT)
      })
      await gugu.dispatch(text, { to: { chat: chat, member: to }, ...pill })
      await answered
    },
  })

  const page = mount(host, {
    store,
    agent,
    // The same energy as everywhere: a note costs 50. But a look here is a whole turn of a real agent, so the page
    // asks once per note's worth of writing instead of at every clause, takes up to three notes from one look and
    // shows them one by one as the writer earns them. No nudges at pauses: each would be a turn too.
    pace: { cost: 50, stride: 50, batch: 3, lull: false },
    placeholder: say('Write something…', '写点什么…'),
    theme: ctx.themeMode === 'dark' ? 'dark' : 'light',
  })
  await page.ready
  const unbind = gugu.bind.text(page.text, f.textAt(['text']))

  // The toolbar button is a press, so it may open gugu's own sheet to choose among several agents.
  async function command(id: string) {
    if (id !== 'glance') return
    const here = await agentsHere()
    if (here.length > 1 && !getSelection()?.toString()) {
      const picked = await gugu.dispatch(say('Read along as I write on this page.', '我在这页纸上写东西，请你在页边读。'), { ...pill, offer: ['agent-in-chat'] })
      if (picked.cancelled) return
      f.data.reader = picked.to.member
      return
    }
    page.glance(getSelection()?.toString())
  }
  return {
    command,
    text: () => page.text.read(),
    glance: (focus?: string) => page.glance(focus),
    async close() {
      if (typeof unbind === 'function') unbind()
      page.destroy()
      await f.close()
    },
  }
}

// ---- The list ---------------------------------------------------------------------------------------------------

/** The chat files found for each note, to open them by. */
const entries = new Map<string, any>()
let notes: Note[] = []

/** One search across every chat this person is in, and this device's pages. */
async function load(): Promise<Note[]> {
  const [searched, chats] = await Promise.all([gugu.files.search({ query: SUFFIX, suffixes: ['.json'], limit: 200 }), gugu.chats.list()])
  const found = searched.filter((e: any) => e.chat && e.name.endsWith(SUFFIX))
  // A private chat goes by the other one in it (chatName); say it is one.
  const dms = new Set(chats.chats.filter((c: any) => c.kind === 'dm').map((c: any) => c.id))
  const whereOf = (e: any) => (dms.has(e.chat) ? say(`Private chat with ${e.chatName ?? ''}`, `和 ${e.chatName ?? ''} 的私聊`) : (e.chatName ?? ''))
  entries.clear()
  for (const e of found) entries.set(e.id, e)
  const chat: Note[] = found.map((e: any) => ({ key: e.id, chat: e.chat, name: e.name, where: whereOf(e), at: e.updatedAt ?? null }))
  return [...chat, ...(await localNotes())]
}

/** The pages on this device: one file each under pages/, and 0.2's single one. Empty ones are gone. */
async function localNotes(): Promise<Note[]> {
  const listed = await gugu.listData(LOCAL_DIR).catch(() => [])
  const paths = [LEGACY, ...listed.filter((e: any) => e.kind === 'file').map((e: any) => e.path as string)]
  const read = await Promise.all(paths.map(async (path) => [path, await gugu.readData(path).catch(() => null)] as const))
  return read.flatMap(([path, raw]) => {
    if (!raw) return []
    const page = JSON.parse(raw)
    const text = String(page.text ?? '')
    if (!text.trim()) return []
    return [{ key: path, chat: null, name: (firstLine(text).slice(0, 30) || say('Untitled', '未命名')) + SUFFIX, where: '', at: typeof page.at === 'string' ? page.at : null }]
  })
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const shell = $('shell')
const toggle = $<HTMLButtonElement>('toggle')
const whereLabel = $('where')
const addButton = $<HTMLButtonElement>('new')
const search = $<HTMLInputElement>('search')
const rows = $('rows')
const host = $('page')
const top = $('with')
const start = $('start')
const dialog = $<HTMLDialogElement>('edit')

search.placeholder = say('Search pages', '搜索笔记')
addButton.querySelector('span')!.textContent = say('New page', '新的一页')
addButton.setAttribute('aria-label', say('New page', '新的一页'))
const placeLabel = (n: Pick<Note, 'chat' | 'where'>) =>
  n.chat === null ? say('Only on this device', '只在这台设备上') : n.chat === HERE ? (n.where || say('This chat', '这个聊天')) : n.where

function setListing(on: boolean) {
  shell.classList.toggle('listing', on)
  // Going to the list is leaving the page: a page still under a default name takes its first line first, so the list says it.
  if (on) void (current ? settle(current.note, current.text()) : Promise.resolve()).catch(() => {}).then(refresh)
  drawBar()
}
toggle.onclick = () => setListing(!shell.classList.contains('listing'))

function drawBar() {
  const listing = shell.classList.contains('listing')
  toggle.innerHTML = listing
    ? `<gugu-icon name="chevron-left"></gugu-icon><span>${say('Back to the page', '回到这一页')}</span>`
    : `<gugu-icon name="files"></gugu-icon><span>${say('Pages', '笔记')} · ${notes.length}</span>`
  whereLabel.textContent = listing || !current ? '' : current.note.chat ? say(`In ${current.note.where}`, `在${current.note.where}里`) : say('Only on this device', '只在这台设备上')
}

function drawList() {
  const q = search.value.trim().toLowerCase()
  const shown = ordered(notes, HERE).filter((n) => !q || `${titleOf(n.name)} ${n.where}`.toLowerCase().includes(q))
  const here = shown.filter((n) => n.chat === HERE)
  const rest = shown.filter((n) => n.chat !== HERE)
  const part = (label: string, list: Note[]) => {
    if (!list.length) return []
    const h = document.createElement('h5')
    h.textContent = `${label} · ${list.length}`
    const ul = document.createElement('ul')
    ul.className = 'list'
    for (const n of list) ul.append(row(n))
    return [h, ul]
  }
  const hereLabel = HERE === null ? say('On this device', '这台设备上') : say(`Written in ${here[0]?.where ?? ''}`, `在${here[0]?.where ?? ''}里写的`)
  const nodes: HTMLElement[] = [...part(hereLabel, here), ...part(say('Elsewhere', '其它'), rest)]
  if (!nodes.length) {
    const empty = document.createElement('gugu-empty')
    empty.innerHTML = `<strong>${q ? say('No page matches', '没有找到') : say('No pages yet', '还没有笔记')}</strong>`
    nodes.push(empty)
  }
  rows.replaceChildren(...nodes)
}
search.oninput = drawList

function row(n: Note): HTMLElement {
  const li = document.createElement('li')
  li.tabIndex = 0
  li.dataset.key = n.key
  if (current?.note.key === n.key) li.setAttribute('aria-current', 'page')
  li.innerHTML = '<gugu-icon name="file-text"></gugu-icon><div><strong></strong><span></span></div><gugu-time></gugu-time><button type="button"><gugu-icon name="ellipsis"></gugu-icon></button>'
  li.querySelector('strong')!.textContent = titleOf(n.name)
  li.querySelector('span')!.textContent = placeLabel(n)
  const time = li.querySelector('gugu-time')!
  if (n.at) time.setAttribute('datetime', n.at)
  else time.remove()
  const more = li.querySelector('button')!
  more.setAttribute('aria-label', say('Rename or delete', '改名或删除'))
  more.onclick = (event) => (event.stopPropagation(), void edit(n))
  // A page someone else deleted since the list was read: say so, and read the list again.
  li.onclick = () => void show(n).catch((error) => (gugu.reportError(message(error)), refresh()))
  li.onkeydown = (event) => event.key === 'Enter' && event.target === li && li.click()
  return li
}

// The list spans every chat, so no one chat's change event covers it: it is read again when the page comes back into view
// (a tab the host keeps mounted gets focus or a context change, not a visibilitychange), at most once in 2 s.
let lastRead = 0
const reread = () => {
  if (document.visibilityState !== 'visible' || Date.now() - lastRead < 2000) return
  lastRead = Date.now()
  void refresh()
}
document.addEventListener('visibilitychange', reread)
addEventListener('focus', reread)
gugu.onContextChanged?.(reread)

async function refresh() {
  notes = await load().catch((error) => (gugu.reportError(message(error)), notes))
  // The page being written stays in the list even before it has words (a new page on this device is saved on the first one).
  if (current && !notes.some((n) => n.key === current!.note.key)) notes = [current.note, ...notes]
  drawList()
  drawBar()
}

// ---- Rename and delete: one small dialog --------------------------------------------------------------------------

const nameInput = dialog.querySelector('input')!
const [saveButton, deleteButton, cancelButton] = dialog.querySelectorAll('button')
const askDelete = dialog.querySelector('p')!
dialog.querySelector('h3')!.textContent = say('Page', '这页笔记')
saveButton!.textContent = say('Rename', '改名')
cancelButton!.textContent = say('Cancel', '取消')

async function edit(n: Note) {
  const local = n.chat === null
  nameInput.value = titleOf(n.name)
  nameInput.disabled = local // a page on this device is called by its first line
  saveButton!.hidden = local
  askDelete.hidden = true
  deleteButton!.textContent = say('Delete', '删除')
  const entry = entries.get(n.key)
  deleteButton!.hidden = !local && !(await gugu.files.canDelete(entry).then((r: boolean[]) => r[0]).catch(() => false))
  dialog.showModal()
  const others = () => notes.filter((o) => o.chat === n.chat && o.key !== n.key).map((o) => o.name)
  saveButton!.onclick = async () => {
    const title = nameInput.value.trim()
    if (!title || title === titleOf(n.name)) return dialog.close()
    try {
      await gugu.files.rename(entry, uniqueName(title, others()))
      dialog.close()
      await refresh()
      if (current?.note.key === n.key) current.note = notes.find((o) => o.key === n.key) ?? current.note
      drawBar()
    } catch (error) {
      gugu.reportError(message(error))
    }
  }
  deleteButton!.onclick = async () => {
    if (askDelete.hidden) {
      askDelete.hidden = false
      askDelete.textContent = say(`Delete “${titleOf(n.name)}”? This can't be undone.`, `删除「${titleOf(n.name)}」？删除后无法恢复。`)
      deleteButton!.textContent = say('Delete', '确定删除')
      return
    }
    try {
      if (current?.note.key === n.key) await leave()
      if (local) await gugu.writeData(n.key, '')
      else await gugu.files.remove(entry)
      dialog.close()
      await refresh()
      if (!current) await openFirst()
    } catch (error) {
      gugu.reportError(message(error))
    }
  }
  cancelButton!.onclick = () => dialog.close()
}

// ---- Showing a page ---------------------------------------------------------------------------------------------

/** A page left under a name nobody chose takes its first line as its name, so the list and the chat's folder say what it is. */
async function settle(n: Note, text: string) {
  const entry = entries.get(n.key)
  if (n.chat === null || !entry || !isDefaultName(n.name)) return
  const line = firstLine(text)
  if (!line) return
  const name = uniqueName(line, notes.filter((o) => o.chat === n.chat && o.key !== n.key).map((o) => o.name))
  await gugu.files.rename(entry, name).then(() => (n.name = name), (error: unknown) => gugu.reportError(message(error)))
}

async function leave() {
  const was = current
  current = null
  if (!was) return
  const text = was.text()
  await was.close()
  await settle(was.note, text).catch(() => {})
  host.replaceChildren()
}

const LAST = 'type-and-memory:last'
async function show(n: Note) {
  if (current?.note.key === n.key) return setListing(false)
  await leave()
  start.hidden = true
  host.hidden = false
  top.hidden = n.chat !== null
  if (n.chat) {
    const page = await openPage(entries.get(n.key), host)
    current = { note: n, ...page }
  } else {
    current = { note: n, ...(await openLocal(n.key)) }
  }
  if (HERE === null) localStorage.setItem(LAST, n.key)
  gugu.setTabTitle?.(`type and memory · ${titleOf(n.name)}`)
  shell.classList.remove('listing')
  // The list beside it (wide) says what changed on the way: the page left may have been named, this one is new.
  await refresh()
}

/** A new page where the list was opened: a file of this chat, or a page on this device. */
addButton.onclick = () =>
  void (async () => {
    if (HERE !== null) {
      const name = newName(new Date(), notes.filter((n) => n.chat === HERE).map((n) => n.name))
      const entry = await gugu.files.create({ chat: HERE, name }, {})
      entries.set(entry.id, entry)
      const n: Note = { key: entry.id, chat: HERE, name: entry.name, where: notes.find((o) => o.chat === HERE)?.where ?? ctx.chat?.name ?? '', at: entry.updatedAt ?? new Date().toISOString() }
      notes = [n, ...notes]
      await show(n)
    } else {
      await show({ key: `${LOCAL_DIR}/${crypto.randomUUID()}.json`, chat: null, name: say('Untitled', '未命名') + SUFFIX, where: '', at: new Date().toISOString() })
    }
  })().catch((error) => gugu.reportError(message(error)))

// ---- A page on this device, and taking it to an agent -------------------------------------------------------------

/** Until the server has every write of this file. */
function whenSaved(f: any): Promise<void> {
  if (f.saved) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => (off(), reject(new Error(say('it was not saved within 10 s', '10 秒内没能存好')))), 10_000)
    const off = f.onStatus(() => {
      if (f.saved) (clearTimeout(timer), off(), resolve())
    })
  })
}

/** The private chat between the person and this agent of theirs, and the agent as a member of it; null if they have none. */
async function privateChatWith(agent: string) {
  const dms = (await gugu.chats.list()).chats.filter((c: any) => c.kind === 'dm')
  for (const c of dms) {
    const me = (await gugu.chats.members({ chat: c.id })).members.find((m: any) => m.kind === 'agent' && bare(m.id) === bare(agent))
    if (me) return { chat: c.id as string, agent: me as { id: string; name: string } }
  }
  return null
}

const whoButton = top.querySelector('button')!
whoButton.querySelector('span')!.textContent = say('Find an agent to read along', '找个 agent 一起读')
whoButton.title = say('Pick an agent; what you wrote goes with you', '选一个 agent，写好的字会一起带过去')
top.querySelector('small')!.textContent = say('Only on this device', '只在这台设备上')

async function openLocal(path: string) {
  const store = dataStore({ read: (p) => gugu.readData(p), write: (p, c) => gugu.writeData(p, c) }, path)
  const page = mount(host, { store, placeholder: say('Write something…', '写点什么…'), theme, energyBar: false })
  await page.ready
  const local = Object.assign(store, { page })
  // Asking for a look with nobody to ask picks somebody first; the page goes along, then they look.
  const take = (thenLook: boolean) => void takeToAgent(path, local, thenLook).catch((error) => gugu.reportError(message(error)))
  whoButton.onclick = () => take(false)
  return {
    command: (id: string) => void (id === 'glance' && take(true)),
    text: () => page.text.read(),
    glance: () => {},
    async close() {
      await store.retire()
      page.destroy()
    },
  }
}

/** This device's page becomes a new page of the private chat with the agent picked; written, read back, then let go here. */
async function takeToAgent(path: string, local: ReturnType<typeof dataStore> & { page: ReturnType<typeof mount> }, thenLook: boolean) {
  const picked = await gugu.pickAgent({
    title: say('Write with', '陪你写的 agent'),
    subject: 'type and memory',
    body: say('It reads your page and leaves notes in the margin. What you wrote here goes into your private chat with it.', '它会读你的这页纸，把注意到的批在页边。你在这里写好的字会带进你和它的私聊。'),
    action: say('Write with it', '和它一起写'),
    search: say('Search your agents', '搜索你的 agent'),
    empty: say('You have no agent yet.', '你还没有 agent。'),
  })
  if (picked.cancelled) return
  const found = await privateChatWith(picked.agent)
  if (!found) {
    gugu.reportError(say('You have no private chat with this agent yet. Say something to it in its chat, then pick it again; your page stays here.', '你和这个 agent 还没有私聊。先在它的私聊里和它说一句话，再回来选它；你写的字还留在这里。'))
    return
  }
  const text = local.page.text.read()
  await refresh()
  const name = uniqueName(firstLine(text) || newName(new Date(), []).slice(0, -SUFFIX.length), notes.filter((n) => n.chat === found.chat).map((n) => n.name))
  const entry = await gugu.files.create({ chat: found.chat, name }, {})
  const f = await openFile(entry)
  local.page.text.element.contentEditable = 'false'
  try {
    await carry(text, {
      text: () => String(f.data.text ?? ''),
      write: (next) => (f.data.text = next),
      saved: () => whenSaved(f),
      reread: async () => String((await gugu.files.open(entry)).data.text ?? ''),
    }, async () => {
      await local.retire()
      await gugu.writeData(path, '')
    })
  } catch (error) {
    local.page.text.element.contentEditable = 'true'
    await f.close()
    gugu.reportError(say(`Could not take your page to ${found.agent.name}: ${message(error)}. It is still here, on this device.`, `没能把这页带到和 ${found.agent.name} 的私聊里：${message(error)}。你写的字还在这台设备上。`))
    return
  }
  await f.close()
  await refresh()
  const n = notes.find((o) => o.key === entry.id)
  if (n) await show(n)
  if (thenLook) current?.glance()
}

// ---- Start ------------------------------------------------------------------------------------------------------

async function openFirst() {
  const list = ordered(notes, HERE)
  const last = HERE === null ? localStorage.getItem(LAST) : null
  const n = list.find((o) => o.key === last) ?? list[0]
  if (n && (HERE === null || n.chat === HERE)) return show(n)
  if (HERE !== null) {
    // A chat with no page yet gets the one every version opens first.
    const entry = await gugu.files.create({ chat: HERE, name: LEGACY }, {}, { ifExists: 'use' })
    await refresh()
    const made = notes.find((o) => o.key === entry.id)
    if (made) return show(made)
  }
  // On its own with nothing written yet: start writing here, or with an agent.
  host.hidden = true
  top.hidden = true
  start.hidden = false
  start.querySelector('p')!.textContent = say('Write here. If you like, an agent of yours reads along and leaves notes in the margin.', '在这里写字。想要的话，可以让你的一个 agent 在旁边读，把它注意到的批在页边。')
  const [write, pick] = start.querySelectorAll('button')
  write!.textContent = say('Start writing', '直接开始写')
  pick!.textContent = say('Pick an agent to write with', '选一个 agent 陪你写')
  write!.onclick = () => addButton.click()
  pick!.onclick = () =>
    void (async () => {
      const picked = await gugu.pickAgent({ title: say('Write with', '陪你写的 agent'), subject: 'type and memory', action: say('Write with it', '和它一起写'), search: say('Search your agents', '搜索你的 agent'), empty: say('You have no agent yet.', '你还没有 agent。') })
      if (picked.cancelled) return
      const found = await privateChatWith(picked.agent)
      if (!found) return gugu.reportError(say('You have no private chat with this agent yet. Say something to it in its chat, then pick it again.', '你和这个 agent 还没有私聊。先在它的私聊里和它说一句话，再回来选它。'))
      const entry = await gugu.files.create({ chat: found.chat, name: newName(new Date(), notes.filter((n) => n.chat === found.chat).map((n) => n.name)) }, {})
      await refresh()
      const made = notes.find((o) => o.key === entry.id)
      if (made) await show(made)
    })().catch((error) => gugu.reportError(message(error)))
}

try {
  notes = await load()
  drawBar()
  if (ctx.file) {
    entries.set(ctx.file.id, ctx.file)
    const n = notes.find((o) => o.key === ctx.file.id) ?? { key: ctx.file.id, chat: ctx.file.chat, name: ctx.file.name, where: ctx.chat?.name ?? '', at: ctx.file.updatedAt ?? null }
    await show(n)
  } else await openFirst()
  drawList()
} catch (error) {
  gugu.reportError(message(error))
  throw error
}
