/**
 * Screenshots the hub + every game's ready screen to verify the mute button
 * (.hudbtn, now bottom-right) does not overlap any HUD element.
 * Usage: node test/allgames.mjs [url]
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
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => document.querySelectorAll('button').length > 10, { timeout: 45000 })
await sleep(2500)

const hub = await page.$('.app')
await hub.screenshot({ path: 'test/shots/all-00-hub.png' })
console.log('→ hub shot')

const names = ['chick', 'stack', 'bull', 'rush', 'swat', 'slice', 'dash']
for (let i = 0; i < names.length; i++) {
  await page.evaluate((idx) => {
    const plays = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Play')
    plays[idx].click()
  }, i)
  await sleep(1200)
  const stage = await page.$('.gameview')
  if (stage) await stage.screenshot({ path: `test/shots/all-0${i + 1}-${names[i]}.png` })
  console.log(`→ ${names[i]} shot`)
  // back to hub
  await page.evaluate(() => {
    const back = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Back to house'))
    // no back button on ready screen — use the ← button
    const arrow = [...document.querySelectorAll('.gamebar button')][0]
    if (arrow) arrow.click()
    else if (back) back.click()
  })
  await sleep(1000)
}

await browser.close()
console.log('done')
process.exit(0)
