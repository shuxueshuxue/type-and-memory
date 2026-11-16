// One sheet from the stress shots: node scripts/stress-sheet.mjs <dir> <out.png>
import { launch } from './browser.mjs'
import { readFileSync, existsSync } from 'node:fs'
const [dir, out] = process.argv.slice(2)
const img = (name) => (existsSync(`${dir}/${name}.png`) ? `<img src="data:image/png;base64,${readFileSync(`${dir}/${name}.png`).toString('base64')}">` : '<i>—</i>')
const scenes = [['ten-in-one', '一段里划 10 处'], ['long-notes', '批注远长于正文（相邻三行，各 190 字）'], ['back-to-back', '同一行里首尾相邻的三处']]
const cell = (title, name, cls = '') => `<figure class="${cls}"><figcaption>${title}</figcaption>${img(name)}</figure>`
const html = scenes.map(([key, title]) => `
  <h2>${title}</h2>
  <div class=row>${cell('旧版 · 1440', `${key}-old-1440`)}${cell('新版 · 1440', `${key}-new-1440`)}${cell('新版 · 光标进入第一处（展开，盖在下面的批注上）', `${key}-new-1440-open`)}</div>
  <div class=row>${cell('旧版 · 900', `${key}-old-900`)}${cell('新版 · 900', `${key}-new-900`)}${cell('旧版 · 手机 390', `${key}-old-390`, 'phone')}${cell('新版 · 手机 390', `${key}-new-390`, 'phone')}${cell('新版 · 手机，点到划线处', `${key}-new-390-open`, 'phone')}</div>`).join('')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 3000, height: 1000 } })
await page.setContent(`<style>
  body{margin:0;padding:36px;background:#eceae4;font:24px/1.4 "Noto Sans CJK SC",sans-serif;color:#2a2926;width:2928px}
  h2{font-size:30px;margin:26px 0 12px} .row{display:flex;gap:24px;margin-bottom:24px;align-items:flex-start}
  figure{margin:0;flex:1;min-width:0} figure.phone{flex:0 0 300px} figcaption{font-size:20px;margin-bottom:6px;color:#55524b}
  img{width:100%;display:block;border-radius:8px;box-shadow:0 2px 14px rgb(0 0 0/.12)}
</style>${html}`)
await page.screenshot({ path: out, fullPage: true })
await browser.close()
