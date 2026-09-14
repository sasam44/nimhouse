#!/usr/bin/env node
/**
 * NimHouse Cup — payout runner
 * ---------------------------
 * Pays out a CLOSED 3-day cup period from the NimHouse wallet.
 *
 * How it works:
 *  1. Reads the public cup data (entries + recorded payouts) straight from
 *     this public repo — no GitHub token needed:
 *       https://raw.githubusercontent.com/sasam44/nimhouse/main/data/cup.json
 *  2. Computes top 3 per game (highest score; ties → earliest submission).
 *     100 NIM (10,000,000 Luna) per game is split 50 / 30 / 20.
 *  3. You make the real payments from your Nimiq Pay wallet (testnet NIM)
 *     and paste each transaction hash back here.
 *  4. The script records each tx via POST /api/cup/payout (admin-gated).
 *     The live Cup card then shows the "paid ✓" badge and the hash is public
 *     in data/cup.json for anyone to audit.
 *
 * Usage (from the repo root, where .env.cup-admin lives):
 *   node scripts/payout.mjs                 # most recent CLOSED period
 *   node scripts/payout.mjs --dry-run       # only print the payout table
 *   node scripts/payout.mjs --period P6901  # pay a specific period
 *   node scripts/payout.mjs --pool 50       # different pool size (NIM)
 *
 * The admin secret is read from .env.cup-admin (CUP_ADMIN_SECRET=...) —
 * the same value configured in Vercel as CUP_ADMIN_SECRET.
 */
import { readFileSync, existsSync } from 'node:fs'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const REPO = 'sasam44/nimhouse'
const RAW = `https://raw.githubusercontent.com/${REPO}/main/data/cup.json`
const API = 'https://nimhouse.vercel.app'
const LUNA_PER_NIM = 100_000
const SPLIT = [50, 30, 20]
const GAMES = ['chick', 'stack', 'bull', 'rush', 'swat', 'slice', 'hop']
const NAMES = {
  chick: 'NimChick', stack: 'NimStack', bull: 'NimBullseye', rush: 'NimRush',
  swat: 'NimSwat', slice: 'NimSlice', hop: 'NimHop',
}

// ---- args ----
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : fallback
}
const DRY_RUN = argv.includes('--dry-run')
const POOL_NIM = Number(arg('--pool', 200))
const requestedPeriod = arg('--period', null)

// ---- 3-day cup period math (must match api/cup.js) ----
function periodInfo(date = new Date()) {
  const days = Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000
  )
  const p = Math.floor(days / 3)
  const start = new Date(p * 3 * 86400000)
  const end = new Date((p + 1) * 3 * 86400000)
  return { p, id: `P${p}`, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

// ---- helpers ----
const fmtLuna = (l) => `${(l / LUNA_PER_NIM).toLocaleString('en-US')} NIM`
const group = (a) => (a || '').replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim()

function top3(entries) {
  return [...entries]
    .sort((a, b) => b.score - a.score || a.ts - b.ts)
    .slice(0, 3)
}

function loadAdminSecret() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const envFile = path.join(here, '..', '.env.cup-admin')
  if (!existsSync(envFile)) {
    console.error(`No .env.cup-admin next to the repo root (expected: ${envFile}).`)
    console.error('It should contain: CUP_ADMIN_SECRET=<the value in Vercel>')
    process.exit(1)
  }
  const m = readFileSync(envFile, 'utf8').match(/CUP_ADMIN_SECRET=([^\s]+)/)
  if (!m) {
    console.error('.env.cup-admin does not contain CUP_ADMIN_SECRET=...')
    process.exit(1)
  }
  return m[1]
}

// ---- main ----
console.log('🏆 NimHouse Cup — payout runner')
console.log(`   source: ${RAW}\n`)

let data
try {
  const r = await fetch(RAW)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  data = await r.json()
} catch (e) {
  console.error(`Could not fetch cup data: ${e.message}`)
  process.exit(1)
}

const current = periodInfo()
const target = requestedPeriod ? { ...periodInfo(), p: Number(requestedPeriod.replace('P', '')), id: requestedPeriod } : { p: current.p - 1, id: `P${current.p - 1}` }
if (target.p < 0 || (target.id !== current.id && target.p >= current.p)) {
  console.error(`Period ${target.id} has not closed yet (current: ${current.id}, closes ${current.end}).`)
  console.error('Payouts run after a period ends. Use --period Pxxxx for an already-closed period.')
  process.exit(1)
}
const pStart = new Date(target.p * 3 * 86400000).toISOString().slice(0, 10)
const pEnd = new Date((target.p + 1) * 3 * 86400000).toISOString().slice(0, 10)
console.log(`   period: ${target.id}  (${pStart} → ${pEnd})  · pool ${POOL_NIM} NIM/game · split ${SPLIT.join(' / ')}%`)
if (target.id !== current.id) console.log(`   (current period is ${current.id}, closes ${current.end})\n`)

const poolLuna = POOL_NIM * LUNA_PER_NIM
const shareLuna = SPLIT.map((pct) => Math.round((poolLuna * pct) / 100))

// build the payout plan
const plan = []
for (const g of GAMES) {
  const entries = data.entries?.[g]?.[target.id] || []
  if (entries.length === 0) continue
  const winners = top3(entries)
  winners.forEach((e, i) => {
    plan.push({
      game: g, rank: i + 1, pct: SPLIT[i],
      luna: shareLuna[i],
      name: e.name, address: e.address || '', score: e.score, ts: e.ts,
      already: data.payouts?.[g]?.[target.id]?.[String(i + 1)],
    })
  })
  if (entries.length < 3) {
    const unclaimed = shareLuna.slice(entries.length).reduce((a, b) => a + b, 0)
    if (unclaimed > 0) plan.push({ game: g, unclaimed, note: `only ${entries.length} entrant(s) — ${fmtLuna(unclaimed)} of the pool stays unclaimed` })
  }
}

if (plan.filter((x) => x.rank).length === 0) {
  console.log(`\nNo entries for ${target.id} — nothing to pay. 🎉 (or: the cup is empty)`)
  process.exit(0)
}

console.log('\n')
for (const p of plan) {
  if (p.rank) {
    const flag = p.already ? `  [already paid: ${p.already}]` : ''
    const addr = p.address ? group(p.address) : '⚠️  NO ADDRESS — cannot pay'
    console.log(`  ${NAMES[p.game].padEnd(11)} #${p.rank}  ${fmtLuna(p.luna).padStart(12)}  ${String(p.name).padEnd(18)} score ${String(p.score).padStart(7)}  →  ${addr}${flag}`)
  } else {
    console.log(`  ${NAMES[p.game].padEnd(11)}    (note) ${p.note}`)
  }
}
const payable = plan.filter((p) => p.rank && !p.already && p.address)
const noAddr = plan.filter((p) => p.rank && !p.already && !p.address)
if (noAddr.length) console.log(`\n  ⚠️  ${noAddr.length} winner(s) have no address on record — they cannot be paid (check the entry in data/cup.json).`)

if (DRY_RUN) {
  console.log('\n--dry-run: nothing recorded.')
  process.exit(0)
}
if (payable.length === 0) {
  console.log('\nNothing left to pay for this period.')
  process.exit(0)
}

console.log(`\n💳 Make ${payable.length} payment(s) from your Nimiq Pay wallet (testnet) and paste each tx hash below.`)
console.log('   Skip a payment with "s" (it will simply stay unpaid).\n')

// EOF-safe line reader: works in a real terminal (interactive) and with
// piped stdin (each provided line is consumed in order; when input runs
// out, the remaining payments are skipped).
const rl = readline.createInterface({ input: process.stdin, terminal: Boolean(process.stdin.isTTY) })
const lineQueue = []
const lineWaiters = []
rl.on('line', (l) => {
  const w = lineWaiters.shift()
  if (w) w(l)
  else lineQueue.push(l)
})
let eof = false
rl.on('close', () => {
  eof = true
  while (lineWaiters.length) lineWaiters.shift()(null)
})
const askLine = () => {
  if (eof) return Promise.resolve(null)
  if (lineQueue.length) return Promise.resolve(lineQueue.shift())
  return new Promise((res) => lineWaiters.push(res))
}

let okCount = 0
for (const p of payable) {
  const label = `${NAMES[p.game]} #${p.rank} · ${p.name} · ${fmtLuna(p.luna)} → ${group(p.address)}`
  let hash
  while (true) {
    const line = await askLine()
    if (line === null) { hash = null; break } // stdin closed / EOF
    const raw = line.trim()
    if (/^s$/i.test(raw)) { hash = null; break }
    if (/^0x[0-9a-f]{8,}$/i.test(raw)) { hash = raw; break }
    console.log('  not a valid tx hash (expected 0x + hex) — try again')
  }
  if (!hash) {
    if (eof) {
      console.log(`\n(input ended) — skipping ${label} and the rest\n`)
      break
    }
    console.log(`  skipped ${label}\n`)
    continue
  }
  const r = await fetch(`${API}/api/cup/payout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cup-admin': loadAdminSecret() },
    body: JSON.stringify({ game: p.game, period: target.id, rank: p.rank, tx: hash }),
  })
  const j = await r.json().catch(() => ({ ok: false, error: 'bad response' }))
  if (j.ok) {
    okCount++
    console.log(`  ✓ recorded ${NAMES[p.game]} #${p.rank} → ${hash}\n`)
  } else {
    console.log(`  ✗ failed to record (${j.error || r.status}) — you can retry this one manually\n`)
  }
}
if (!rl.closed) rl.close()

console.log(`Done: ${okCount}/${payable.length} payout(s) recorded for ${target.id}.`)
console.log(`Live board: ${API}  ·  audit: https://github.com/${REPO}/blob/main/data/cup.json`)
