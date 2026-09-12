/**
 * NimHouse smoke test — runs the PRODUCTION bundle inside jsdom.
 * Scenario: load app → demo wallet detected → connect (simulated) →
 * play NimChick → chicken dies → score auto-recorded to leaderboard.
 *
 * Usage: node test/smoke.mjs   (after: npm run build)
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

// ---------- jsdom setup ----------
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

// ---------- scenario ----------
await sleep(1200)
check('hub renders (NimHouse wordmark)', document.body.textContent.includes('NimHouse'))
check('five game cards listed', ['NimChick', 'NimStack', 'NimBullseye', 'NimRush', 'NimSwat'].every((n) => document.body.textContent.includes(n)))
check('fair-play strip shown', document.body.textContent.includes('No gambling'))

// wallet: outside Nimiq Pay → init() times out (8s) → demo mode
await sleep(9000)
check('demo mode badge appears after SDK timeout', document.body.textContent.includes('DEMO'))

const allButtons = () => [...document.querySelectorAll('button')]
const connectBtn = allButtons().find((b) => b.textContent.includes('Connect wallet'))
check('connect button present', !!connectBtn)
connectBtn.dispatchEvent(new window.Event('click', { bubbles: true }))
await sleep(1500)
check('wallet connected (simulated address shown)', /NQ71/.test(document.body.textContent))
check('block number shown', /block\s*[\d,]+/.test(document.body.textContent.replace(/\s+/g, ' ')))

// set gamertag (React controlled input needs the native value setter)
const nameInput = document.querySelector('.name-input')
const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
nativeSetter.call(nameInput, 'SmokeTest')
nameInput.dispatchEvent(new window.Event('input', { bubbles: true }))

// open NimChick
const playButtons = allButtons().filter((b) => b.textContent.trim() === 'Play')
check('play buttons present (5)', playButtons.length === 5)
playButtons[0].dispatchEvent(new window.Event('click', { bubbles: true }))
await sleep(600)
check('NimChick ready overlay', document.body.textContent.includes('TAP or SPACE to flap'))

// tap to start (engine listens on .gameview)
const view = document.querySelector('.gameview')
view.dispatchEvent(new window.Event('pointerdown', { bubbles: true }))
await sleep(450)
check('game running (ready overlay gone)', !document.body.textContent.includes('TAP or SPACE to flap'))

// let the chicken die (no flapping) → auto-record
await sleep(5000)
check('game-over overlay appears', document.body.textContent.includes('Play again'))
const lb = JSON.parse(window.localStorage.getItem('nimhouse.lb.chick') || '[]')
check('score auto-recorded to leaderboard', lb.length > 0)
check('leaderboard entry has name', lb[0]?.name === 'SmokeTest')

// verify flow (demo signing)
const verifyBtn = allButtons().find((b) => b.textContent.includes('Verify score'))
if (verifyBtn) {
  verifyBtn.dispatchEvent(new window.Event('click', { bubbles: true }))
  await sleep(1500)
  check('score verified (demo signature)', document.body.textContent.includes('WALLET-VERIFIED'))
  const lbAfter = JSON.parse(window.localStorage.getItem('nimhouse.lb.chick') || '[]')
  check('leaderboard entry marked verified', lbAfter.some((e) => e.verified))
} else {
  check('verify button present', false)
}

// back to hub
const backBtn = allButtons().find((b) => b.textContent.includes('Back to house'))
backBtn.dispatchEvent(new window.Event('click', { bubbles: true }))
await sleep(600)
check('back on hub', document.body.textContent.includes('NIM shop'))
check('best score chip rendered', document.body.innerHTML.includes('best'))

console.log(failures === 0 ? '\nSMOKE TEST PASSED' : `\nSMOKE TEST FAILED (${failures} checks)`)
process.exit(failures === 0 ? 0 : 1)
