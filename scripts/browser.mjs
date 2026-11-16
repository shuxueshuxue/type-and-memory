import { chromium } from 'playwright-core'
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** A Chromium to drive: CHROME if set, else the newest headless shell Playwright has cached. */
export async function launch(options = {}) {
  const cache = join(homedir(), '.cache/ms-playwright')
  const shell = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().at(-1)
  const executablePath = process.env.CHROME ?? join(cache, shell, readdirSync(join(cache, shell)).find((d) => d.startsWith('chrome')), 'chrome-headless-shell')
  return chromium.launch({ executablePath, ...options })
}
