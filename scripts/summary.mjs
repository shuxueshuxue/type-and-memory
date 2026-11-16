// One picture for the report: the old writing page, the new one, and the new one inside a 咕咕 private chat.
import { launch } from './browser.mjs'
import { readFileSync } from 'node:fs'
const [out, old, web, dark, narrow, gugu] = process.argv.slice(2)
const img = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 2400, height: 1000 } })
await page.setContent(`<style>
  body{margin:0;padding:40px;background:#f1efe9;font:26px/1.4 "Noto Sans CJK SC",sans-serif;color:#2a2926;width:2320px}
  h2{font-size:26px;font-weight:600;margin:0 0 12px} .row{display:flex;gap:40px;margin-bottom:44px;align-items:flex-start}
  figure{margin:0;flex:1;min-width:0} img{width:100%;display:block;border-radius:10px;box-shadow:0 2px 18px rgb(0 0 0/.12)}
  .small{flex:0 0 420px}
</style>
<div class=row><figure><h2>旧版 Ink &amp; Memory 的写作页</h2><img src="${img(old)}"></figure><figure><h2>type and memory · 独立网页（真实模型批注，光标在「保持」上）</h2><img src="${img(web)}"></figure></div>
<div class=row><figure><h2>咕咕私聊里：聊天里的 agent 就是页边的声音（真实一轮：写 → 批注 → 回话 → 它再答）</h2><img src="${img(gugu)}"></figure></div>
<div class=row><figure><h2>深色</h2><img src="${img(dark)}"></figure><figure class=small><h2>窄屏（批注进底部托盘）</h2><img src="${img(narrow)}"></figure></div>`)
await page.screenshot({ path: out, fullPage: true })
await browser.close()
