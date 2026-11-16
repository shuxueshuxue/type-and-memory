// type and memory as an Obsidian view. The page is the note itself: the text
// is the Markdown file, the margin notes sit in a %% comment %% at its end.
// The agent is a model endpoint from the plugin's settings.

import { App, Plugin, PluginSettingTab, Setting, TextFileView, TFile, WorkspaceLeaf, requestUrl } from 'obsidian'
import { introspection } from '../../src/agents/introspection'
import { llmAgent } from '../../src/agents/llm'
import { mount, type Doc, type Page, type Store } from '../../src/index'
import { parseSidecar, writeSidecar } from '../../src/stores/sidecar'

const VIEW = 'type-and-memory'

interface Settings {
  url: string
  key: string
  model: string
}
const DEFAULTS: Settings = { url: '', key: '', model: '' }

// Obsidian's requestUrl is not bound by the browser's CORS rules; give it fetch's shape.
const fetcher = (async (url: string, init?: RequestInit) => {
  const res = await requestUrl({ url, method: init?.method, headers: init?.headers as Record<string, string>, body: init?.body as string, throw: false })
  return { ok: res.status < 400, status: res.status, text: async () => res.text, json: async () => res.json }
}) as unknown as typeof fetch

class PageView extends TextFileView {
  private page?: Page
  private loaded?: (doc: Doc) => void
  private changed?: (doc: Doc) => void
  private written: string | null = null

  constructor(leaf: WorkspaceLeaf, private plugin: TypeAndMemory) {
    super(leaf)
  }
  // Methods, not fields: Obsidian's base constructor calls getViewType before a subclass's fields exist.
  getViewType() {
    return VIEW
  }
  getDisplayText() {
    return this.file?.basename ?? 'type and memory'
  }
  getIcon() {
    return 'feather'
  }

  // Obsidian hands the file's content here: once on open, again whenever it changes on disk.
  setViewData(data: string, clear: boolean) {
    if (clear || !this.page) this.show()
    if (data === this.written) return
    this.written = data
    const doc = parseSidecar(data)
    if (this.loaded) (this.loaded(doc), (this.loaded = undefined))
    else this.changed?.(doc)
  }
  getViewData() {
    return this.written ?? ''
  }
  clear() {
    this.page?.destroy()
    this.page = undefined
    this.written = null
  }

  // Not named open: View.open is how Obsidian attaches a view to its leaf.
  private show() {
    this.clear()
    const store: Store = {
      load: () => new Promise((resolve) => (this.loaded = resolve)),
      save: async (doc) => {
        this.written = this.data = writeSidecar(doc)
        this.requestSave()
      },
      watch: (onChange) => ((this.changed = onChange), () => (this.changed = undefined)),
    }
    const { url, key, model } = this.plugin.settings
    const personas = introspection(window.localStorage.getItem('language') ?? 'en')
    this.page = mount(this.contentEl, {
      store,
      agent: url ? llmAgent({ url, key, model, personas, fetch: fetcher }) : undefined,
      voices: personas,
      theme: document.body.classList.contains('theme-dark') ? 'dark' : 'light',
    })
  }

  async onClose() {
    this.clear()
  }
}

export default class TypeAndMemory extends Plugin {
  settings: Settings = DEFAULTS

  async onload() {
    this.settings = { ...DEFAULTS, ...(await this.loadData()) }
    this.registerView(VIEW, (leaf) => new PageView(leaf, this))
    this.addSettingTab(new ModelTab(this.app, this))
    const openIn = (file: TFile) => this.app.workspace.getLeaf(false).setViewState({ type: VIEW, state: { file: file.path }, active: true })
    this.addCommand({
      id: 'open',
      name: 'Open this note as a page',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile()
        if (!file || file.extension !== 'md') return false
        if (!checking) void openIn(file)
        return true
      },
    })
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && file.extension === 'md') menu.addItem((item) => item.setTitle('Open as a type and memory page').setIcon('feather').onClick(() => openIn(file)))
      }),
    )
  }
}

class ModelTab extends PluginSettingTab {
  constructor(app: App, private plugin: TypeAndMemory) {
    super(app, plugin)
  }
  display() {
    this.containerEl.empty()
    const field = (name: string, desc: string, key: keyof Settings, placeholder: string) =>
      new Setting(this.containerEl).setName(name).setDesc(desc).addText((text) =>
        text.setPlaceholder(placeholder).setValue(this.plugin.settings[key]).onChange(async (value) => {
          this.plugin.settings[key] = value.trim()
          await this.plugin.saveData(this.plugin.settings)
        }),
      )
    field('Endpoint', 'An OpenAI-compatible API. Leave empty for a page with no voices.', 'url', 'https://api.deepseek.com/v1')
    field('Key', 'Stored in this vault’s plugin data.', 'key', 'sk-…')
    field('Model', '', 'model', 'deepseek-chat')
  }
}
