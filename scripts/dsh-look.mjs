// Open the local dsh web UI (URL with its token read from the log) and run a snippet: node scripts/dsh-look.mjs <log> <out.png> [js body with page in scope]
import { launch } from './browser.mjs'
import { readFileSync } from 'node:fs'
const [log, out, code] = process.argv.slice(2)
const url = readFileSync(log, 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)[0]
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, locale: 'zh-CN' })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)))
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text().slice(0, 300)))
await page.goto(url)
await page.waitForTimeout(5000)
if (code) console.log(await new Function('page', `return (async () => { ${code} })()`)(page))
await page.screenshot({ path: out })
console.log((await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 700))
if (errors.length) console.log(errors.slice(0, 6).join('\n'))
await browser.close()
