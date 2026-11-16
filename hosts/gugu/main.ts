// type and memory inside a 咕咕 chat. The page is one file of the chat; the
// agent in the margin is an agent of that chat. Asking it is a whisper; what
// it says comes back through the tools in tools.ts, which write into the file.
//
// Opened on its own (the App's tab in the dock, a phone's App page) there is no chat yet: the person picks one of
// their agents and the page is the one in their private chat with it. From then on it is the same page, the same
// whisper and the same tools as when it is opened in that chat.

import { mount, type Agent, type Mark, type Store } from '../../src/index'
import { carry, dataStore } from './alone'

declare const gugu: any

const ctx = await gugu.getContext()
const zh = String(ctx.locale ?? '').startsWith('zh')
const say = (en: string, cn: string) => (zh ? cn : en)
const PAGE = 'page.tam.json'
const bare = (id: string) => String(id).replace(/^user:/, '')

/** The chat's own page, made on first use. */
const pageIn = async (chat: string) =>
  (await gugu.files.list({ chat, folder: '' })).find((e: any) => e.name === PAGE) ?? (await gugu.files.create({ chat, name: PAGE }, {}, { ifExists: 'use' }))

// The page on screen now. The toolbar is one for the tab, whichever page it shows.
let current: Awaited<ReturnType<typeof openPage>> | null = null
// Nothing open yet (on its own, before an agent is picked): the toolbar's press picks one.
let unopened: (() => void) | null = null
gugu.onCommand((id: string) => (current ? current.command(id) : unopened?.()))

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
    glance: (focus?: string) => page.glance(focus),
    async close() {
      if (typeof unbind === 'function') unbind()
      page.destroy()
      await f.close()
    },
  }
}

// ---- On its own. Two ways to write: alone, on a page kept on this device, or with an agent the person picks, on the
// page of their private chat with it. Which one was last is kept on this screen only (the person's choice, not the
// chat's), so the tab opens straight onto it next time.
type Last = { agent: string; chat: string } | { alone: true }
const LAST = 'type-and-memory:with'
const last = (): Last | null => {
  try {
    const w = JSON.parse(localStorage.getItem(LAST) ?? 'null')
    return w?.alone === true ? { alone: true } : w && typeof w.agent === 'string' && typeof w.chat === 'string' ? w : null
  } catch {
    return null
  }
}
const remember = (w: Last) => localStorage.setItem(LAST, JSON.stringify(w))
const lastAgent = () => {
  const w = last()
  return w && 'agent' in w ? w.agent : undefined
}

/** The private chat between the person and this agent of theirs, and the agent as a member of it; null if they have none. */
async function privateChatWith(agent: string, hint?: string) {
  const dms = (await gugu.chats.list()).chats.filter((c: any) => c.kind === 'dm')
  // The chat it was in last time first: one read instead of one per private chat.
  dms.sort((a: any, b: any) => Number(b.id === hint) - Number(a.id === hint))
  for (const c of dms) {
    const me = (await gugu.chats.members({ chat: c.id })).members.find((m: any) => m.kind === 'agent' && bare(m.id) === bare(agent))
    if (me) return { chat: c.id as string, agent: me as { id: string; name: string } }
  }
  return null
}

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

async function alone() {
  const top = document.getElementById('with')!
  const start = document.getElementById('start')!
  const host = document.getElementById('page')!
  const who = top.querySelector('button')!
  const name = who.querySelector('span')!
  const note = top.querySelector('small')!
  const hint = start.querySelector('p')!
  const [write, pick] = start.querySelectorAll('button')
  write!.textContent = say('Start writing', '直接开始写')
  pick!.textContent = say('Pick an agent to write with', '选一个 agent 陪你写')

  // The page on this device, while no agent is picked: written in the App's own data, never in a chat.
  const HERE = 'page.tam.json'
  let here: (ReturnType<typeof dataStore> & { page: ReturnType<typeof mount> }) | null = null

  const empty = (why?: string) => {
    top.hidden = true
    host.hidden = true
    start.hidden = false
    hint.textContent = why ?? say('Write here. If you like, an agent of yours reads along and leaves notes in the margin.', '在这里写字。想要的话，可以让你的一个 agent 在旁边读，把它注意到的批在页边。')
  }
  const show = (label: string, title: string, aside = '') => {
    start.hidden = true
    host.hidden = false
    top.hidden = false
    name.textContent = label
    note.textContent = aside
    who.title = title
    gugu.setTabTitle?.(aside ? 'type and memory' : `type and memory · ${label.replace(/^和 | 一起写$|^Writing with /g, '')}`)
  }

  async function writeAlone() {
    await current?.close()
    current = null
    host.replaceChildren()
    const store = dataStore({ read: (p) => gugu.readData(p), write: (p, c) => gugu.writeData(p, c) }, HERE)
    const page = mount(host, { store, placeholder: say('Write something…', '写点什么…'), theme: ctx.themeMode === 'dark' ? 'dark' : 'light', energyBar: false })
    here = Object.assign(store, { page })
    show(say('Find an agent to read along', '找个 agent 一起读'), say('Pick an agent; what you wrote goes with you', '选一个 agent，写好的字会一起带过去'), say('Only on this device', '只在这台设备上'))
    current = {
      // Asking for a look with nobody to ask picks somebody first; the page goes along, then they look.
      command: async (id: string) => void (id === 'glance' && (await choose(true))),
      glance: () => {},
      async close() {
        page.destroy()
        here = null
      },
    }
    await page.ready
    remember({ alone: true })
  }

  /** Into the private chat with this agent; what was written on this device goes along first. */
  async function writeWith(agent: string, hintChat?: string): Promise<boolean> {
    const found = await privateChatWith(agent, hintChat)
    if (!found) {
      if (here) {
        gugu.reportError(say('You have no private chat with this agent yet. Say something to it in its chat, then pick it again; your page stays here.', '你和这个 agent 还没有私聊。先在它的私聊里和它说一句话，再回来选它；你写的字还留在这里。'))
        return false
      }
      empty(say('You have no private chat with this agent yet. Say something to it in its chat, then pick it here again.', '你和这个 agent 还没有私聊。先在它的私聊里和它说一句话，再回来选它。'))
      return false
    }
    const entry = await pageIn(found.chat)
    if (here) {
      const local = here
      const f = await openFile(entry)
      local.page.text.element.contentEditable = 'false'
      try {
        await carry(local.page.text.read(), {
          text: () => String(f.data.text ?? ''),
          write: (text) => (f.data.text = text),
          saved: () => whenSaved(f),
          reread: async () => String((await gugu.files.open(entry)).data.text ?? ''),
        }, async () => {
          await local.retire()
          await gugu.writeData(HERE, '')
        })
      } catch (error) {
        local.page.text.element.contentEditable = 'true'
        gugu.reportError(say(`Could not take your page to ${found.agent.name}: ${error instanceof Error ? error.message : error}. It is still here, on this device.`, `没能把这页带到和 ${found.agent.name} 的私聊里：${error instanceof Error ? error.message : error}。你写的字还在这台设备上。`))
        return false
      }
    }
    await current?.close()
    current = null
    host.replaceChildren()
    show(say(`Writing with ${found.agent.name}`, `和 ${found.agent.name} 一起写`), say('Write with another agent', '换一个 agent 陪你写'))
    current = await openPage(entry, host)
    remember({ agent: found.agent.id, chat: found.chat })
    return true
  }

  // gugu's own sheet, in this App's words: the person's agents, the one they write with ticked.
  async function choose(thenLook = false) {
    const picked = await gugu.pickAgent({
      title: say('Write with', '陪你写的 agent'),
      subject: 'type and memory',
      body: here
        ? say('It reads your page and leaves notes in the margin. What you wrote here goes into your private chat with it.', '它会读你的这页纸，把注意到的批在页边。你在这里写好的字会带进你和它的私聊。')
        : say('It reads your page as you write and leaves notes in the margin. The page lives in your private chat with it.', '你写的时候它在旁边读，把注意到的批在页边。这页纸存在你和它的私聊里。'),
      action: say('Write with it', '和它一起写'),
      search: say('Search your agents', '搜索你的 agent'),
      empty: say('You have no agent yet.', '你还没有 agent。'),
      ...(lastAgent() ? { preselect: lastAgent() } : {}),
    })
    if (picked.cancelled) return
    try {
      if ((await writeWith(picked.agent)) && thenLook) current?.glance()
    } catch (error) {
      gugu.reportError(error instanceof Error ? error.message : String(error))
    }
  }
  write!.onclick = () => void writeAlone().catch((error) => gugu.reportError(error instanceof Error ? error.message : String(error)))
  pick!.onclick = () => choose()
  who.onclick = () => choose()
  unopened = () => choose()

  // Where the person was last; a page left on this device is never hidden behind an empty start.
  const was = last()
  const left = String(JSON.parse((await gugu.readData(HERE).catch(() => null)) || '{}').text ?? '')
  if (was && 'agent' in was && !left.trim() && (await writeWith(was.agent, was.chat).catch(() => false))) return
  if ((was && 'alone' in was) || left.trim()) return void (await writeAlone())
  empty()
}

// Opened for a file (a pill, the chat's folder) the page is that file; opened from the chat's App list it is
// the chat's own page; opened on its own, as the person last left it.
try {
  if (ctx.file) current = await openPage(ctx.file)
  else if (ctx.chat) current = await openPage(await pageIn(ctx.chat.id))
  else await alone()
} catch (error) {
  gugu.reportError(error instanceof Error ? error.message : String(error))
  throw error
}
