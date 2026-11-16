// Draws the App icon: a sheet of paper, a letter, one stroke of marker.
import { launch } from './browser.mjs'
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 256, height: 256 } })
await page.setContent(`<body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="56" fill="#fbfaf6"/>
  <rect x="58" y="150" width="140" height="34" rx="6" fill="hsl(150 90% 80%)"/>
  <text x="128" y="182" text-anchor="middle" font-family="Georgia, 'Noto Serif', serif" font-size="150" font-weight="500" fill="#2a2926">t</text>
  <rect x="196" y="64" width="6" height="96" rx="3" fill="hsl(15 70% 62%)"/>
</svg></body>`)
await page.screenshot({ path: process.argv[2], omitBackground: true })
await browser.close()
