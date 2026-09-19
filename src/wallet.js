import { init, requestDeviceIdentifier } from '@nimiq/mini-app-sdk'

/**
 * Recipient for in-app NIM payments (skin purchases + cheers).
 * House wallet: @nimhouse — NQ52 UUPV JEM5 SBRA Y98H S0FP YHCX HUQR H8CJ
 * (same wallet that stakes & pays the cups; handle verified on-chain).
 */
export const CHEER_ADDRESS = 'NQ52UUPVJEM5SBRAY98HS0FPYHCXHUQRH8CJ'

export const LUNA_PER_NIM = 100000

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Simulated provider used when the app runs OUTSIDE Nimiq Pay
 * (browser preview, local dev). Every action resolves with plausible
 * fake data after a short delay so the whole app stays testable.
 */
function createDemoNimiq() {
  const address = 'NQ71 4NIMHO USE0 0000 0000 0000 0000 00'
  return {
    _demo: true,
    demoAddress: address,
    async listAccounts() {
      await delay(500)
      return [address]
    },
    async sign(message) {
      await delay(650)
      const h = randomHex(32)
      return { publicKey: h.slice(0, 64), signature: h + h.slice(0, 64) }
    },
    async isConsensusEstablished() {
      return true
    },
    async getBlockNumber() {
      return 2_847_000 + Math.floor(Math.random() * 40)
    },
    async sendBasicTransaction() {
      await delay(800)
      return '0x' + randomHex(32)
    },
    async sendBasicTransactionWithData() {
      await delay(800)
      return '0x' + randomHex(32)
    },
  }
}

let walletPromise = null

/**
 * Resolve to { mode: 'live' | 'demo', nimiq, error }.
 * 'live' when running inside Nimiq Pay, 'demo' (simulated) otherwise.
 */
export function getWallet() {
  if (!walletPromise) {
    walletPromise = (async () => {
      try {
        const nimiq = await init({ timeout: 8000 })
        return { mode: 'live', nimiq, error: null }
      } catch (err) {
        return { mode: 'demo', nimiq: createDemoNimiq(), error: err?.message || String(err) }
      }
    })()
  }
  return walletPromise
}

/**
 * Pseudonymous device id: real per-origin id inside Nimiq Pay
 * (requestDeviceIdentifier), stable local id outside.
 * Result is cached for the session: the native permission prompt shows at
 * most ONCE (and never hangs — bounded wait, then local fallback).
 */
let deviceIdPromise = null
export function getDeviceId() {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      if (window.nimiqPay && window.nimiqPay.requestDeviceIdentifier) {
        try {
          const id = await Promise.race([
            requestDeviceIdentifier({ reason: 'NimHouse leaderboard ranking and anti-spam' }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('device-id timeout')), 8000)),
          ])
          if (id) return id
        } catch {
          /* denied or interrupted — fall back below */
        }
      }
      let local = localStorage.getItem('nimhouse.device')
      if (!local) {
        local = 'dev-' + randomHex(8)
        localStorage.setItem('nimhouse.device', local)
      }
      return local
    })()
  }
  return deviceIdPromise
}

export const fmtNim = (luna) =>
  (luna / LUNA_PER_NIM).toLocaleString('en-US', { maximumFractionDigits: 6 }) + ' NIM'

export const shortHash = (h) => {
  const s = String(h || '')
  return s.length > 16 ? `${s.slice(0, 12)}…${s.slice(-6)}` : s
}
