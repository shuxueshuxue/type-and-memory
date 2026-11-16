// The flow check: the writer only types. No click, no key but text. Logs when each note and nudge appears and where the energy bar is.
//   node scripts/flow.mjs <url> <out.png>
import { launch } from './browser.mjs'
const [url, out] = process.argv.slice(2)
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 760 }, deviceScaleFactor: 2, locale: 'zh-CN' })
page.on('pageerror', (e) => console.log('pageerror:', e.message))
await page.goto(url)
await page.waitForSelector('.tm-text[contenteditable="true"]')
const t0 = Date.now()
await page.exposeFunction('report', (what) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`, what))
await page.evaluate(() => {
  const seen = new Set()
  new MutationObserver(() => {
    for (const n of document.querySelectorAll('.tm-margin .tm-note')) if (!seen.has(n)) { seen.add(n); report('note: ' + n.innerText.replace(/\n/g, ' ').slice(0, 60)) }
    const w = document.querySelector('.tm-whisper'); if (w && !seen.has(w)) { seen.add(w); report('nudge: ' + w.innerText.slice(0, 60)) }
  }).observe(document.querySelector('.tm-root'), { childList: true, subtree: true })
})
const text = '说“我们还是做朋友吧”的时候，我笑着说“好啊”。真他妈虚伪。我明明想抓住她的肩膀问清楚到底哪里不够好。但那样就输了，对吗？要保持风度。输了才他妈输了呢！我应该直接说出来的。可是说了又能怎么样？改变不了任何事情。数据很清楚：她不喜欢你。接受现实吧。'
// The page is focused by the first key press of a real person; here the click stands for sitting down at it.
await page.click('.tm-text')
for (const ch of text) {
  await page.keyboard.type(ch)
  await page.waitForTimeout(180)
}
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s typing done; bar`, await page.evaluate(() => document.querySelector('.tm-energy-fill')?.style.width))
await page.waitForTimeout(12000)
console.log(JSON.stringify(await page.evaluate(() => ({ notes: document.querySelectorAll('.tm-margin .tm-note').length, nudge: document.querySelector('.tm-whisper')?.innerText ?? null, bar: document.querySelector('.tm-energy-fill')?.style.width }))))
await page.screenshot({ path: out })
await browser.close()
