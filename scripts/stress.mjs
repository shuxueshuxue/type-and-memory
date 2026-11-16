// Margin layout under pressure, old page and new page given the same text and notes.
//   node scripts/stress.mjs <out dir>
// Writes <scene>-<arm>-<width>.png and prints, for the new page, what the layout guarantees:
// no note sits lower than its phrase's line, none overlaps another, the margin ends where the text does.
import { launch } from './browser.mjs'
import { NEW, OLD, editable, enter, seed } from './arms.mjs'
import { mkdirSync } from 'node:fs'

const out = process.argv[2] ?? 'shots/stress'
mkdirSync(out, { recursive: true })
const long = '你把“风度”说了三遍，每一遍后面跟着的都是一件你没有做的事：没有问，没有抓住，没有说出来。到这里它已经不是修养了，是一个你用来解释自己为什么站着不动的词。你写“输了”的时候，是在跟谁比？她并没有在场。在场的只有那个笑着说好啊的人，和现在坐在这里骂他虚伪的人。这两个人都是你，而且他们谁也不肯先开口承认对方说的有一部分是对的。'
const para = '说“我们还是做朋友吧”的时候，我笑着说“好啊”。真他妈虚伪。我明明想抓住她的肩膀问清楚到底哪里不够好。但那样就输了，对吗？要保持风度。输了才他妈输了呢！我应该直接说出来的。可是说了又能怎么样？改变不了任何事情。数据很清楚：她不喜欢你。接受现实吧。然后我回家，把门关上，在玄关站了很久，鞋也没换。'
const note = (quote, text) => ({ quote, note: text })
const scenes = {
  // One paragraph, ten phrases marked.
  'ten-in-one': {
    text: `${para}\n后来的事情我记不太清了。`,
    notes: ['做朋友', '笑着说', '真他妈虚伪', '抓住她的肩膀', '那样就输了', '保持风度', '直接说出来', '改变不了任何事情', '数据很清楚', '鞋也没换'].map((q, i) =>
      note(q, ['这句话是谁先说出口的？', '笑的时候，手在哪里？', '你骂的是那个笑，还是那句“好啊”？', '想抓住的是肩膀，还是一个答案？', '输给谁？', '风度是给谁看的？', '说出来的话，第一句会是什么？', '任何事情里，包括你自己吗？', '这里突然换了一个人在说话。', '站在玄关的那段时间，你在等什么？'][i])),
  },
  // Notes far longer than the text they sit beside, on adjacent lines.
  'long-notes': {
    text: '要保持风度。\n输了才他妈输了呢！\n我应该直接说出来的。',
    notes: [note('保持风度', long), note('输了才他妈输了', long), note('直接说出来', long)],
  },
  // Three phrases back to back on one line.
  'back-to-back': {
    text: '可是说了又能怎么样？改变不了任何事情。数据很清楚：她不喜欢你。',
    notes: [note('说了又能怎么样', '你已经替她回答了。'), note('改变不了任何事情', '任何事情里，包括你自己吗？'), note('数据很清楚', '这里突然换了一个人在说话。')],
  },
}

// A long page: forty paragraphs, two notes in each.
const many = Array.from({ length: 40 }, (_, i) => `第${i + 1}天。${para.slice(0, 60 + (i % 5) * 25)}`)
scenes['eighty'] = { text: many.join('\n'), notes: many.flatMap((_, i) => [note(`第${i + 1}天`, `这一天你只写了开头。${long.slice(0, (i % 4) * 40)}`), note(many[i].slice(8, 12), '这里。')]).filter((n) => n.quote.length > 1) }

const browser = await launch()
for (const [name, scene] of Object.entries(scenes)) {
  for (const arm of ['new', 'old']) {
    for (const width of [1440, 900, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 780 : 700 }, deviceScaleFactor: 2, locale: 'zh-CN', isMobile: width === 390, hasTouch: width === 390 })
      const page = await context.newPage()
      await seed(page, arm, scene.text, scene.notes)
      await page.goto(arm === 'new' ? NEW : OLD)
      await page.waitForSelector(editable[arm])
      await enter(page, arm)
      // Ink & Memory sizes its textarea when you type; a page restored from the server stays two lines tall until then.
      if (arm === 'old') { await page.focus('textarea'); await page.keyboard.press('Control+End'); await page.keyboard.type('x'); await page.keyboard.press('Backspace'); await page.mouse.move(5, 500) }
      await page.waitForTimeout(1200)
      await page.screenshot({ path: `${out}/${name}-${arm}-${width}.png` })
      if (arm === 'new' && width !== 390) {
        const facts = await page.evaluate(() => {
          const shown = [...document.querySelectorAll('.tm-margin .tm-note')].filter((n) => getComputedStyle(n).display !== 'none').map((n) => n.getBoundingClientRect()).sort((a, b) => a.top - b.top)
          const text = document.querySelector('.tm-text').getBoundingClientRect()
          return {
            notes: document.querySelectorAll('.tm-margin .tm-note').length,
            places: shown.length,
            overlaps: shown.filter((r, i) => i && r.top < shown[i - 1].bottom - 0.5).length,
            pastText: Math.max(0, Math.round((shown.at(-1)?.bottom ?? 0) - text.bottom)),
          }
        })
        console.log(name, width, JSON.stringify(facts))
        // Reading one in full: the caret goes into the first marked phrase.
        await page.evaluate((quote) => {
          for (const p of document.querySelectorAll('.tm-text p')) {
            const i = p.textContent.indexOf(quote)
            if (i < 0) continue
            document.querySelector('.tm-text').focus()
            getSelection().collapse(p.firstChild, i + 1)
            return
          }
        }, scene.notes[0].quote)
        await page.waitForTimeout(500)
        await page.screenshot({ path: `${out}/${name}-${arm}-${width}-open.png` })
      }
      if (arm === 'new' && width === 390) {
        await page.tap('.tm-text p')
        await page.evaluate((quote) => { for (const p of document.querySelectorAll('.tm-text p')) { const i = p.textContent.indexOf(quote); if (i >= 0) return getSelection().collapse(p.firstChild, i + 1) } }, scene.notes[0].quote)
        await page.waitForTimeout(500)
        await page.screenshot({ path: `${out}/${name}-${arm}-${width}-open.png` })
      }
      await context.close()
    }
  }
}
await browser.close()
