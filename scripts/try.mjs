// Drive the real page like a writer: type, wait for the margin, take a picture.
//   node scripts/try.mjs http://localhost:4319/ shots/web.png [--dark] [--width=1440]
import { launch } from './browser.mjs'

const [url, out] = process.argv.slice(2)
const flag = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const lines = [
  '说“我们还是做朋友吧”的时候，我笑着说“好啊”。真他妈虚伪。',
  '我明明想抓住她的肩膀问清楚到底哪里不够好。但那样就输了，对吗？要保持风度。',
  '输了才他妈输了呢！我应该直接说出来的。',
  '可是说了又能怎么样？改变不了任何事情。数据很清楚：她不喜欢你。接受现实吧。',
]

const browser = await launch()
const page = await browser.newPage({
  viewport: { width: Number(flag('width', 1440)), height: Number(flag('height', 900)) },
  deviceScaleFactor: 2,
  colorScheme: process.argv.includes('--dark') ? 'dark' : 'light',
  locale: 'zh-CN',
})
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()))
page.on('pageerror', (e) => console.log('pageerror:', e.message))
await page.goto(url)
await page.click('.tm-text')
for (const [i, line] of lines.entries()) {
  if (i) await page.keyboard.press('Enter')
  await page.keyboard.type(line, { delay: 25 })
  // Give the agent the time a writer would: a pause after each paragraph.
  await page.waitForTimeout(Number(flag('pause', 9000)))
}
await page.waitForTimeout(Number(flag('settle', 6000)))
console.log(JSON.stringify(await page.evaluate(() => ({
  notes: [...document.querySelectorAll('.tm-note')].map((n) => n.innerText.replace(/\n/g, ' | ')),
  foot: document.querySelector('.tm-foot')?.innerText,
  paragraphs: document.querySelectorAll('.tm-text p').length,
})), null, 1))
await page.screenshot({ path: out })
await browser.close()
