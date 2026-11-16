// type and memory in DeepSeek Harness, browser half: a tab in the right
// sidebar holding the page. Asking the agent is a message into the session
// the tab belongs to; what it says arrives through the page file.

import { mount, type Agent, type Doc, type Store } from '../../src/index'
import { FILE, ROUTE, TAB } from './shared'

declare const require: (id: string) => any
const React = require('react')

export const inject = ['slots', 'sidebarRightTabs', 'sidebarRight', 'sessions']

const POLL = 1500

function pageStore(sessionId: string): Store {
  const url = `${ROUTE.slice(1)}?session=${encodeURIComponent(sessionId)}`
  let rev = 0
  let seen: string[] = []
  const read = async (): Promise<Doc & { rev: number }> => {
    const res = await fetch(url)
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `the harness answered ${res.status}`)
    return res.json()
  }
  const took = (doc: Doc & { rev: number }) => ((rev = doc.rev), (seen = doc.marks.map((m) => m.id)), doc)
  return {
    load: async () => took(await read()),
    async save(doc) {
      const res = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: doc.text, marks: doc.marks, seen }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `the harness answered ${res.status}`)
      rev = (await res.json()).rev
      seen = doc.marks.map((m) => m.id)
    },
    // The file is the agent's to write too. Third-party plugins cannot add a forwarded event, so the tab asks.
    watch(onChange) {
      const timer = setInterval(async () => {
        const doc = await read().catch(() => null)
        if (!doc || doc.rev === rev) return
        onChange({ marks: took(doc).marks })
      }, POLL)
      return () => clearInterval(timer)
    },
  }
}

export function apply(ctx: any) {
  const zh = navigator.language.startsWith('zh')
  const say = (en: string, cn: string) => (zh ? cn : en)

  const agentOf = (sessionId: string): Agent => () => ({
    ask(ask) {
      if (ask.kind === 'lull') return
      const conversation = ctx.sessions.scope(sessionId)?.get('conversation')
      if (!conversation) throw new Error(say('This session has no conversation to ask in.', '这个会话现在没法发消息。'))
      conversation.send(
        ask.kind === 'reply'
          ? say(`On my page (${FILE}) I answered your note ${ask.mark.id} on “${ask.mark.quote}”: ${ask.text}\nAnswer under it with page_reply.`,
                `我在纸上（${FILE}）你那条关于「${ask.mark.quote}」的批注（${ask.mark.id}）下回了话：${ask.text}\n请用 page_reply 在它下面接话。`)
          : say(`I wrote more on my page (${FILE})${ask.focus ? `, look at “${ask.focus}”` : ''}. Read it with page_read and, if something is worth it, leave ${(ask.want ?? 1) > 1 ? `up to ${ask.want} new notes this time, each on a phrase that has none yet,` : 'one note'} with page_annotate.`,
                `我在纸上（${FILE}）又写了一些${ask.focus ? `，看看「${ask.focus}」` : ''}。用 page_read 读一读，值得的话用 page_annotate 留${(ask.want ?? 1) > 1 ? `这一次最多 ${ask.want} 条新批注，各钉在还没有批注的话上` : '一条批注'}。`),
      )
    },
  })

  function Body(props: { sessionId: string }) {
    const ref = React.useRef(null)
    React.useEffect(() => {
      const page = mount(ref.current, {
        store: pageStore(props.sessionId),
        agent: agentOf(props.sessionId),
        // As in a chat host: a look is an agent turn, so one ask per note's worth of writing, up to three notes each.
        pace: { cost: 50, stride: 50, batch: 3, lull: false },
        placeholder: say('Write something…', '写点什么…'),
      })
      return () => page.destroy()
    }, [props.sessionId])
    return React.createElement('div', { ref, style: { height: '100%' } })
  }

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB, kind: 'type-and-memory', priority: 'extension', title: () => 'type and memory',
    guide: [{ id: 'open', order: 50, title: () => 'type and memory', description: () => say('Write; the agent reads along in the margin.', '你写，agent 在页边批注。') }],
  }), 'type-and-memory.tab')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: TAB, inject: (sessionId: string) => ({ sessionId }) }, Body,
  )), 'type-and-memory.body')
}
