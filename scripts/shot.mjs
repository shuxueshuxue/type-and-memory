// A picture of a page as stored, with no typing: node scripts/shot.mjs <url> <out.png> [--dark] [--width=] [--height=] [--click=<selector>] [--caret=<phrase>]
import { launch } from './browser.mjs'
const [url, out] = process.argv.slice(2)
const flag = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback
const browser = await launch()
const page = await browser.newPage({
  viewport: { width: Number(flag('width', 1440)), height: Number(flag('height', 900)) },
  deviceScaleFactor: 2,
  colorScheme: process.argv.includes('--dark') ? 'dark' : 'light',
  locale: flag('locale', 'zh-CN'),
})
page.on('pageerror', (e) => console.log('pageerror:', e.message))
await page.goto(url)
await page.waitForTimeout(600)
const caret = flag('caret')
if (caret) {
  await page.evaluate((phrase) => {
    for (const p of document.querySelectorAll('.tm-text p')) {
      const i = p.textContent.indexOf(phrase)
      if (i < 0) continue
      document.querySelector('.tm-text').focus()
      getSelection().collapse(p.firstChild, i + 1)
      return
    }
  }, caret)
}
const click = flag('click')
if (click) await page.click(click)
const type = flag('type')
if (type) await page.keyboard.type(type, { delay: 20 })
await page.waitForTimeout(Number(flag('wait', 700)))
await page.screenshot({ path: out })
await browser.close()
