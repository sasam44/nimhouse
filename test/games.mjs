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
// 5 levels × 5 darts; a short banner blocks input between levels (one throw may be skipped there).
await openGame(2)
check('NimBullseye ready overlay', document.body.textContent.includes('HOLD to charge'))
view = stage()
view.dispatchEvent(new window.Event('pointerdown', { bubbles: true })) // start
await sleep(300)
let bullOver = false
for (let i = 0; i < 34 && !bullOver; i++) {
  view.dispatchEvent(new window.Event('pointerdown', { bubbles: true })) // charge
  await sleep(280 + (i % 5) * 60)
  window.dispatchEvent(new window.Event('pointerup')) // release
  await sleep(1000) // flight + pin (+ level banner)
  bullOver = document.body.textContent.includes('Play again')
}
check('NimBullseye ends after 5 levels (25 darts)', bullOver)
const bullLb = JSON.parse(window.localStorage.getItem('nimhouse.lb.bull') || '[]')
check('NimBullseye score recorded', bullLb.length > 0)
check('bullseye score within possible range (0..3000)', bullLb.length > 0 && bullLb[0].score >= 0 && bullLb[0].score <= 3000)

// --- touch aim: the crosshair floats 110px (RETICLE_LIFT) above the fingertip.
// Quick tap (<200ms) only PLACES the crosshair (no dart); hold + release
// throws to the reticle. Fake a canvas layout (jsdom has none) so pointer
// coordinates map 1:1 onto the 360x600 stage.
const bullCanvas = document.querySelector('canvas.game')
bullCanvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 600 })
const againBtn = allButtons().find((x) => x.textContent.includes('Play again'))
againBtn.dispatchEvent(new window.Event('click', { bubbles: true }))
await sleep(300)
view.dispatchEvent(new window.Event('pointerdown', { bubbles: true })) // start
await sleep(400)
function coordDown(x, y) {
  const ev = new window.Event('pointerdown', { bubbles: true })
  Object.defineProperty(ev, 'clientX', { value: x })
  Object.defineProperty(ev, 'clientY', { value: y })
  view.dispatchEvent(ev)
}
// Finger at (180, 342) → reticle at (180, 232) = board center (level 1 is static).
coordDown(180, 342)
await sleep(80)
window.dispatchEvent(new window.Event('pointerup')) // < 200 ms → aim only, no dart
await sleep(300)
let coordOver = false
for (let i = 0; i < 30 && !coordOver; i++) {
  coordDown(180, 342)
  await sleep(420 + (i % 4) * 90) // held ≥ 200 ms → real throw at the reticle
  window.dispatchEvent(new window.Event('pointerup'))
  await sleep(900) // flight + pin (+ level banner)
  coordOver = document.body.textContent.includes('Play again')
}
check('touch-aim run completes (tap-aim + hold-throw)', coordOver)
const bullLb2 = JSON.parse(window.localStorage.getItem('nimhouse.lb.bull') || '[]')
// static levels 1–2: every dart lands on the board center → 50–100 pts each
check('touch-aim run recorded a positive score (center hits)', bullLb2.length > 1 && bullLb2[0].score > 0)
await backToHub()

// ---------- NimRush ----------
// Round-robin lane spawning guarantees an obstacle in every lane within 3 spawns,
// so holding one lane always ends the run deterministically.
await openGame(3)
check('NimRush ready overlay', document.body.textContent.includes('TAP LEFT / RIGHT'))
view = stage()
view.dispatchEvent(new window.Event('pointerdown', { bubbles: true })) // start
await sleep(400)
over = false
for (let i = 0; i < 16 && !over; i++) {
  const ev = new window.Event('pointerdown', { bubbles: true })
  Object.defineProperty(ev, 'clientX', { value: 10 }) // always steer left → lane 0
  view.dispatchEvent(ev)
  await sleep(500)
  over = document.body.textContent.includes('Play again')
}
check('NimRush run ends (obstacle hit)', over)
const rushLb = JSON.parse(window.localStorage.getItem('nimhouse.lb.rush') || '[]')
check('NimRush score recorded', rushLb.length > 0)
await backToHub()

// ---------- NimSwat ----------
await openGame(4)
check('NimSwat ready overlay', document.body.textContent.includes('flimsy swatter'))
view = stage()
view.dispatchEvent(new window.Event('pointerdown', { bubbles: true })) // start
await sleep(300)
over = false
for (let i = 0; i < 12 && !over; i++) {
  const ev = new window.Event('pointerdown', { bubbles: true })
  Object.defineProperty(ev, 'clientX', { value: 15 }) // far corner → always a miss
  Object.defineProperty(ev, 'clientY', { value: 590 })
  view.dispatchEvent(ev)
  await sleep(450)
  over = document.body.textContent.includes('Play again')
}
check('NimSwat ends after 5 misses (fly escapes)', over)
const swatLb = JSON.parse(window.localStorage.getItem('nimhouse.lb.swat') || '[]')
check('NimSwat score recorded', swatLb.length > 0)
await backToHub()

// ---------- NimSlice ----------
// Swipes map off-canvas in jsdom (rect 0) → no slices → sausages fall → 3 misses → game over.
await openGame(5)
check('NimSlice ready overlay', document.body.textContent.includes('SWIPE to slice'))
view = stage()
const down = new window.Event('pointerdown', { bubbles: true })
Object.defineProperty(down, 'clientX', { value: 100 })
Object.defineProperty(down, 'clientY', { value: 400 })
view.dispatchEvent(down)
const mv = new window.Event('pointermove', { bubbles: true })
Object.defineProperty(mv, 'clientX', { value: 250 })
Object.defineProperty(mv, 'clientY', { value: 150 })
view.dispatchEvent(mv)
await sleep(5500) // 3 sausages fly up + fall = 3 misses
over = document.body.textContent.includes('Play again')
check('NimSlice ends after 3 escapes', over)
const sliceLb = JSON.parse(window.localStorage.getItem('nimhouse.lb.slice') || '[]')
check('NimSlice score recorded', sliceLb.length > 0)
check('slice score is a multiple of 5', sliceLb.length > 0 && sliceLb[0].score % 5 === 0)
await backToHub()

// ---------- NimDash ----------
// Fixed-seed course. A few real jumps (regression guard: input handlers must
// not throw) — then the idle chick runs straight into gaps until the 3 hearts
// drain → game over.
await openGame(6)
check('NimDash ready overlay', document.body.textContent.includes('TAP to jump'))
view = stage()
const rDown = new window.Event('pointerdown', { bubbles: true })
Object.defineProperty(rDown, 'clientX', { value: 180 })
Object.defineProperty(rDown, 'clientY', { value: 400 })
view.dispatchEvent(rDown)
window.dispatchEvent(new window.Event('pointerup', { bubbles: true }))
const rFailsBefore = failures
await sleep(500)
for (let i = 0; i < 4; i++) {
  const td = new window.Event('pointerdown', { bubbles: true })
  Object.defineProperty(td, 'clientX', { value: 180 })
  Object.defineProperty(td, 'clientY', { value: 400 })
  view.dispatchEvent(td)
  window.dispatchEvent(new window.Event('pointerup', { bubbles: true }))
  await sleep(650)
}
check('dash jumps/flaps run without runtime errors', failures === rFailsBefore)
let runOver = false
for (let i = 0; i < 45 && !runOver; i++) {
  await sleep(1000)
  runOver = document.body.textContent.includes('Play again')
}
check('NimDash ends when hearts run out', runOver)
const dashLb = JSON.parse(window.localStorage.getItem('nimhouse.lb.dash') || '[]')
check('NimDash score recorded', dashLb.length > 0)
check('dash score is a non-negative integer', dashLb.length > 0 && Number.isInteger(dashLb[0].score) && dashLb[0].score >= 0)

console.log(failures === 0 ? '\nGAMES TEST PASSED' : `\nGAMES TEST FAILED (${failures} checks)`)
process.exit(failures === 0 ? 0 : 1)
