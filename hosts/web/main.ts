// The standalone page. With no backend it keeps the page in this browser and
// talks to a model with the writer's own key. Served by server/server.mjs it
// finds data-backend on <html> and uses the server for both instead.

import { introspection } from '../../src/agents/introspection'
import { llmAgent } from '../../src/agents/llm'
import { mount } from '../../src/index'
import { httpStore } from '../../src/stores/http'
import { localStore } from '../../src/stores/local'

const backend = document.documentElement.dataset.backend
const zh = navigator.language.startsWith('zh')
const personas = introspection(navigator.language)
const placeholder = zh ? '写点什么…' : 'Write something…'

interface Model {
  url: string
  key: string
  model: string
}
const MODEL_KEY = 'type-and-memory.model'
const saved: Model | null = JSON.parse(localStorage.getItem(MODEL_KEY) ?? 'null')

const agent = backend
  ? llmAgent({ url: `${backend}/v1`, model: 'server', personas })
  : saved?.url
    ? llmAgent({ ...saved, personas })
    : undefined

mount(document.getElementById('page')!, {
  store: backend ? httpStore(`${backend}/doc`) : localStore(),
  agent,
  voices: personas,
  placeholder,
})

if (!backend) modelSettings()

/** Without a backend the model is the writer's to choose; the three fields live behind a quiet gear. */
function modelSettings() {
  const gear = Object.assign(document.createElement('button'), { className: saved?.url ? 'gear' : 'gear unset', textContent: '⚙', title: 'Model' })
  const form = Object.assign(document.createElement('form'), { className: 'model', hidden: true })
  const field = (label: string, name: keyof Model, placeholder: string, type = 'text') => {
    const input = Object.assign(document.createElement('input'), { name, type, placeholder, value: saved?.[name] ?? '', autocomplete: 'off' })
    const wrap = document.createElement('label')
    wrap.append(label, input)
    form.append(wrap)
  }
  field(zh ? '接口地址（OpenAI 兼容）' : 'Endpoint (OpenAI-compatible)', 'url', 'https://api.deepseek.com/v1')
  field(zh ? '密钥' : 'Key', 'key', 'sk-…', 'password')
  field(zh ? '模型' : 'Model', 'model', 'deepseek-chat')
  form.append(
    Object.assign(document.createElement('p'), {
      textContent: zh ? '只存在这个浏览器里，回车保存。' : 'Kept in this browser only. Enter saves.',
    }),
    Object.assign(document.createElement('input'), { type: 'submit', hidden: true }),
  )
  gear.onclick = () => {
    form.hidden = !form.hidden
    gear.setAttribute('aria-expanded', String(!form.hidden))
  }
  form.onsubmit = (e) => {
    e.preventDefault()
    localStorage.setItem(MODEL_KEY, JSON.stringify(Object.fromEntries(new FormData(form))))
    location.reload()
  }
  document.body.append(gear, form)
}
