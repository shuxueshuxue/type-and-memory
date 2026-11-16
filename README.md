# type and memory

A page to write on. As you write, an agent reads along and leaves notes in the margin, each pinned to the words it is
about. You can answer a note; it answers back. That is the whole product.

It is a rewrite of [Ink & Memory](https://github.com/shuxueshuxue/ink-and-memory) down to its writing page, built to be
embedded: the same page runs as a static site, behind a 100-line server, inside a 咕咕 chat with the chat's own agent
in the margin, as an Obsidian view, and as a DeepSeek Harness sidebar tab. [ARCHITECTURE.md](ARCHITECTURE.md) is one page.

```
npm install
npm run build        # dist/web, dist/type-and-memory.js, dist/gugu/app, dist/obsidian, dist/dsh
npm run dev          # the standalone page with rebuild on change
npm test             # the core: desk, anchoring, pacing, sidecar format
```

## Run it

**As a static page.** Serve `dist/web` from anywhere. The page stays in the browser's storage. The gear in the corner
takes any OpenAI-compatible endpoint, a key and a model; without them it is a page with a quiet margin.

**With the backend.** The server keeps the page in a file and holds the model key, so the browser never sees it.

```
TAM_LLM_URL=https://api.deepseek.com/v1 TAM_LLM_KEY=… TAM_LLM_MODEL=deepseek-chat npm run serve
```

**In 咕咕.** `dist/gugu/app` is an App bundle: install it from the App page (装本地文件夹). Open it in a private chat
with an agent, or a group that has one, and write. The agent of that chat is the voice in the margin. Opened on its own
(the dock, a phone's App list), you start writing alone, on a page kept on that device, or pick one of your agents and
write on the page of your private chat with it; what you wrote alone goes along when you pick one. The market's copy is
`sources/type-and-memory/app` in [gugu-apps](https://github.com/GUYI-AI/gugu-apps).

**In Obsidian.** Copy `dist/obsidian` to `<vault>/.obsidian/plugins/type-and-memory`, enable it, set a model endpoint
in its settings, then run "Open this note as a page" on any note. The notes are stored at the end of the Markdown file
in a `%% comment %%`.

**In DeepSeek Harness.** `dsh plugin --profile web add link:/path/to/dist/dsh`, restart `dsh web`, and open
“type and memory” from a session's right sidebar. The session's own agent reads along through three tools.

## Embed it

```js
import { mount } from './type-and-memory.js'

mount(element, {
  store: { load: async () => ({ text: '', marks: [] }), save: async (doc) => {} },
  agent: (desk) => ({
    ask(ask) {
      // ask.kind is 'glance' or 'reply'. Answer whenever you like, through the desk:
      desk.annotate({ quote: 'a phrase from the page', note: 'what you noticed' })
    },
  }),
})
```

A host implements `Store` (where the page lives) and `Agent` (who speaks in the margin). `desk.read / annotate / reply`
is everything an agent can do, and is what each host hands to its own agents as tools. Colours and type are `--tm-*`
CSS variables on `.tm-root`; `parts.note` replaces how a note is drawn; `pace` decides when to ask.

Keys: `Ctrl/⌘ + Enter` asks for a look now (at the selection, if there is one).

## License

MIT, see [LICENSE](LICENSE).
