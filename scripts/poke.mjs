// Interactions on the stored page with the real agent: reply to a note, split a line through a marked sentence, undo, dismiss.
import { launch } from './browser.mjs'
const [url, out] = process.argv.slice(2)
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 620 }, deviceScaleFactor: 2, locale: 'zh-CN' })
page.on('pageerror', (e) => console.log('pageerror:', e.message))
await page.goto(url)
await page.waitForTimeout(500)
const state = () => page.evaluate(() => ({
  notes: [...document.querySelectorAll('.tm-note')].map((n) => `${n.classList.contains('tm-lost') ? '(lost) ' : ''}${n.innerText.replace(/\n/g, ' | ')} @${n.style.transform}`),
  lines: [...document.querySelectorAll('.tm-text p')].map((p) => JSON.stringify(p.textContent.slice(0, 8))),
  highlights: [...CSS.highlights.keys()].map((k) => `${k}:${CSS.highlights.get(k).size}`),
}))
const before = await state()
console.log('before', JSON.stringify(before, null, 1))

// 1. answer the third note
await page.click('.tm-note:nth-child(3)')
await page.keyboard.type('我没看到。咽下去有什么不对？')
await page.keyboard.press('Enter')
await page.waitForTimeout(9000)
console.log('thread', JSON.stringify((await state()).notes[2]))
await page.screenshot({ path: out })

// 2. press Enter in the middle of line 2, before its second marked phrase: both notes must keep their phrases
await page.evaluate(() => {
  const p = document.querySelectorAll('.tm-text p')[1]
  document.querySelector('.tm-text').focus()
  getSelection().collapse(p.firstChild, p.textContent.indexOf('但那样'))
})
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const split = await state()
console.log('after Enter', JSON.stringify({ lines: split.lines, lost: split.notes.filter((n) => n.startsWith('(lost)')).length, highlights: split.highlights }))

// 3. cut a marked phrase away, then undo: the note leaves and returns
await page.evaluate(() => {
  const p = document.querySelectorAll('.tm-text p')[0]
  const i = p.textContent.indexOf('真他妈虚伪')
  getSelection().setBaseAndExtent(p.firstChild, i, p.firstChild, i + 5)
})
await page.keyboard.press('Backspace')
await page.waitForTimeout(300)
console.log('after cut  lost:', (await state()).notes.filter((n) => n.startsWith('(lost)')).length)
await page.keyboard.press('Control+z')
await page.waitForTimeout(300)
console.log('after undo lost:', (await state()).notes.filter((n) => n.startsWith('(lost)')).length)

// 4. dismiss the first note
await page.hover('.tm-note:nth-child(1)')
await page.click('.tm-note:nth-child(1) .tm-x')
await page.waitForTimeout(900)
console.log('after dismiss', (await state()).notes.length, 'notes; stored:', (await (await fetch(new URL('/api/doc', url))).json()).marks.length)
await browser.close()
