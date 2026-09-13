/**
 * Real-browser (Chromium) test of LIVE NimHouse — reproduces what a phone sees.
 * Usage: node test/realbrowser.mjs [url]   (default: https://nimhouse.vercel.app)
 * Writes screenshots to test/shots/*.png and prints console/page errors.
 */
import puppeteer from 'puppeteer'
import { mkdirSync } from 'node:fs'

const URL = process.argv[2] || 'https://nimhouse.vercel.app'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync('test/shots', { recursive: true })

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader'],
})
const page = await browser.newPage()
await page.setViewport({ width: 420, height: 860, deviceScaleFactor: 2 })

const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text())
})

console.log('→ open', URL)
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })

// wait for hub game cards (wallet init)
await page.waitForFunction(() => document.querySelectorAll('button').length > 10, {
  timeout: 45000,
}).catch(() => console.log('!! hub buttons not ready in 45s'))
await sleep(2500)

// open NimRooftop = 7th game card (index 6)
const opened = await page.evaluate(() => {
  const plays = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Play')
  if (plays.length < 7) return `only ${plays.length} Play buttons`
  plays[6].click()
  return 'clicked NimRooftop'
})
console.log('→', opened)
await sleep(1500)

const stageSel = '.gameview'
await page.waitForSelector(stageSel, { timeout: 10000 })
const readyText = await page.evaluate(() => document.body.textContent)
console.log('ready overlay?', readyText.includes('TAP to jump'))

async function stageShot(name) {
  const el = await page.$(stageSel)
  if (el) await el.screenshot({ path: `test/shots/${name}.png` })
}

const box = await (await page.$('canvas')).boundingBox()
const tx = box.x + box.width / 2
const ty = box.y + box.height - 120

// TAP 1 — start the run
await page.mouse.click(tx, ty)
console.log('→ tap 1 (start)')
await sleep(1400) // GO! banner + first rooftops
await stageShot('01-go')

// TAP 2..5 — real jumps (regression: input must not throw; chick should hop)
for (let i = 2; i <= 5; i++) {
  await page.mouse.click(tx, ty)
  await sleep(620)
}
await stageShot('02-jumps')
console.log('→ 5 taps done')

// no more jumps → the chick runs into gaps → 3 hearts drain → game over
let over = false
for (let i = 0; i < 40 && !over; i++) {
  await sleep(1000)
  over = await page.evaluate(() => document.body.textContent.includes('Play again'))
}
console.log('game over?', over)
await stageShot('03-gameover')

console.log('\n=== RUNTIME ERRORS:', errors.length ? '' : 'NONE')
for (const e of errors) console.log('  ' + e)

await browser.close()
process.exit(errors.length === 0 && over ? 0 : 1)
