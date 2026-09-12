/**
 * NimStack + NimBullseye engine smoke test (production bundle in jsdom).
 * Usage: node test/games.mjs  (after: npm run build)
 */
import { JSDOM } from 'jsdom'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
function check(label, cond) {
  console.log(`${cond ? '✅' : '❌'} ${label}`)
  if (!cond) failures++
}

const distDir = path.join(process.cwd(), 'dist')
if (!existsSync(path.join(distDir, 'index.html'))) {
  console.error('Run `npm run build` first.')
  process.exit(1)
}
const html = readFileSync(path.join(distDir, 'index.html'), 'utf8')
const jsHref = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)][0][1]
const jsCode = readFileSync(path.join(distDir, jsHref.slice(1)), 'utf8')

function fakeCtx() {
  const gradient = { addColorStop() {} }
  const target = {}
  return new Proxy(target, {
    get(t, p) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') {
        return () => gradient
      }
      if (p === 'measureText') return () => ({ width: 0 })
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
      if (!(p in t)) t[p] = () => {}
      return t[p]
    },
    set(t, p, v) {
      t[p] = v
      return true
    },
  })
}

const dom = new JSDOM(html, {
  url: 'http://localhost:5173/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    Object.defineProperty(window, 'crypto', { value: globalThis.crypto, configurable: true })
    window.HTMLCanvasElement.prototype.getContext = function () {
      return fakeCtx()
    }
    window.scrollTo = () => {}
  },
})

const { window } = dom
const { document } = window
window.addEventListener('error', (e) => {
  console.log('❌ window error:', e.message)
  failures++
})
window.eval(jsCode)

await sleep(1200)
await sleep(9000) // demo wallet

const allButtons = () => [...document.querySelectorAll('button')]
const stage = () => document.querySelector('.gameview')
const openGame = async (index) => {
  allButtons().filter((b) => b.textContent.trim() === 'Play')[index].dispatchEvent(new window.Event('click', { bubbles: true }))
  await sleep(500)
}
const backToHub = async () => {
  const b = allButtons().find((x) => x.textContent.includes('Back to house'))
  b.dispatchEvent(new window.Event('click', { bubbles: true }))
  await sleep(500)
}

// ---------- NimStack ----------
await openGame(1)
check('NimStack ready overlay', document.body.textContent.includes('TAP or SPACE to drop'))
let view = stage()
view.dispatchEvent(new window.Event('pointerdown', { bubbles: true })) // start
await sleep(700)
let over = false
for (let i = 0; i < 25 && !over; i++) {
  view.dispatchEvent(new window.Event('pointerdown', { bubbles: true }))
  await sleep(380)
  over = document.body.textContent.includes('Play again')
}
check('NimStack run ends with game-over overlay', over)
const stackLb = JSON.parse(window.localStorage.getItem('nimhouse.lb.stack') || '[]')
check('NimStack score recorded', stackLb.length > 0)
await backToHub()

// ---------- NimBullseye ----------
await openGame(2)
check('NimBullseye ready overlay', document.body.textContent.includes('HOLD to charge'))
view = stage()
view.dispatchEvent(new window.Event('pointerdown', { bubbles: true })) // start
await sleep(300)
for (let i = 0; i < 5; i++) {
  view.dispatchEvent(new window.Event('pointerdown', { bubbles: true })) // charge
  await sleep(450 + i * 120)
  window.dispatchEvent(new window.Event('pointerup')) // release
  await sleep(700) // flight + pin
}
await sleep(800)
check('NimBullseye round ends with game-over overlay', document.body.textContent.includes('Play again'))
const bullLb = JSON.parse(window.localStorage.getItem('nimhouse.lb.bull') || '[]')
check('NimBullseye score recorded', bullLb.length > 0)
check('bullseye score within possible range (0..500)', bullLb.length > 0 && bullLb[0].score >= 0 && bullLb[0].score <= 500)

console.log(failures === 0 ? '\nGAMES TEST PASSED' : `\nGAMES TEST FAILED (${failures} checks)`)
process.exit(failures === 0 ? 0 : 1)
