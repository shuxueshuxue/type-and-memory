// A real round in DeepSeek Harness: open the plugin's tab in the session's right sidebar, write, wait for the agent's notes.
//   node scripts/dsh-write.mjs <dsh-web.log> <out.png>
import { launch } from './browser.mjs'
import { readFileSync } from 'node:fs'
const [log, out] = process.argv.slice(2)
const url = readFileSync(log, 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)[0]
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, locale: 'zh-CN', deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)))
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text().slice(0, 300)))
await page.goto(url)
await page.waitForTimeout(4000)
const go = page.getByRole('button', { name: '继续' })
if (await go.count()) await go.click()
await page.getByText('右侧纸面读取设定').first().click()
await page.waitForTimeout(2500)
const open = page.getByRole('button', { name: '打开右侧边栏' })
if (await open.count()) await open.click()
await page.waitForTimeout(1200)
if (!(await page.locator('.tm-text').count())) {
  if (!(await page.getByText('你写，agent 在页边批注。').count())) await page.getByRole('button', { name: '新标签页' }).click()
  await page.getByText('你写，agent 在页边批注。').click()
  await page.waitForTimeout(2500)
}
const state = () => page.evaluate(() => ({
  root: document.querySelector('.tm-root')?.className,
  notes: [...document.querySelectorAll('.tm-note')].map((n) => n.innerText.replace(/\n/g, ' | ')),
  foot: document.querySelector('.tm-foot')?.innerText,
  highlights: [...CSS.highlights.keys()].length,
}))
console.log('mounted', JSON.stringify(await state()))
await page.locator('.tm-text').click()
await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace')
const lines = [
  '说“我们还是做朋友吧”的时候，我笑着说“好啊”。真他妈虚伪。',
  '我明明想抓住她的肩膀问清楚到底哪里不够好。但那样就输了，对吗？要保持风度。',
  '输了才他妈输了呢！我应该直接说出来的。',
  '可是说了又能怎么样？改变不了任何事情。数据很清楚：她不喜欢你。接受现实吧。',
]
for (const [i, line] of lines.entries()) {
  if (i) await page.keyboard.press('Enter')
  await page.keyboard.type(line, { delay: 30 })
  await page.waitForTimeout(3000)
}
for (let t = 0; t < 120; t += 5) {
  await page.waitForTimeout(5000)
  const s = await state()
  if (s.highlights || s.foot) { console.log('after', t + 5, 's', JSON.stringify(s)); break }
}
await page.waitForTimeout(8000)
console.log('final', JSON.stringify(await state()))
await page.screenshot({ path: out })
console.log('conversation tail:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(180, 900))
if (errors.length) console.log(errors.slice(0, 6).join('\n'))
await browser.close()
