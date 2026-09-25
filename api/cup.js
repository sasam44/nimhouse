/**
 * GET /api/cup — current NimHouse Cup state.
 * Returns the active period, pool config, per-game top-10, and payouts.
 */
import { readCup } from './lib/store.js'

export const GAMES = ['chick', 'stack', 'bull', 'rush', 'swat', 'slice', 'dash']

/**
 * Cup grid. Every cup ends at 16:00 UTC and is paid right after (house
 * policy). P6904 (first cup after the P6903 early close) opens
 * 2026-09-15T12:00Z and runs to the next 16:00 UTC anchor; P6905–P6908 are
 * 48h on the 16:00 UTC anchor; from P6909 (opened at the P6908 close,
 * 2026-09-25T16:00Z) cups run 3 days (72h) on the same anchor:
 *   P6904      = [2026-09-15T12:00Z, 2026-09-17T16:00Z)
 *   P6905–6908 = [16:00Z + (n-6905)*48h, +48h)
 *   P{n>=6909} = [2026-09-25T16:00Z + (n-6909)*72h, +72h)
 * The frontend uses the same function for the signed message, so client and
 * server always agree on the current period.
 */
const PERIOD_MS = 2 * 86400 * 1000 // 2-day cups (P6905–P6908)
const PERIOD3_MS = 3 * 86400 * 1000 // 3-day cups (P6909 onward)
const P6904_START = Date.parse('2026-09-15T12:00:00.000Z') // P6904 open
const P6904_END = Date.parse('2026-09-17T16:00:00.000Z') // P6904 close (2 days)
const BASE_MS = P6904_END // anchor for P6905 onward
const BASE_P = 6905
const P3_START = Date.parse('2026-09-25T16:00:00.000Z') // P6909 open (3-day era)
const P3_BASE = 6909
export function cupPeriod(date = new Date()) {
  const t = Date.parse(date)
  let p, start, dur
  if (t >= P3_START) {
    p = P3_BASE + Math.floor((t - P3_START) / PERIOD3_MS)
    start = new Date(P3_START + (p - P3_BASE) * PERIOD3_MS)
    dur = PERIOD3_MS
  } else if (t >= P6904_START && t < P6904_END) {
    p = 6904
    start = new Date(P6904_START)
    dur = P6904_END - P6904_START
  } else if (t < P6904_START) {
    p = 6904 - 1 - Math.floor((P6904_START - 1 - t) / PERIOD_MS)
    start = new Date(P6904_START + (p - 6904) * PERIOD_MS)
    dur = PERIOD_MS
  } else {
    p = BASE_P + Math.floor((t - BASE_MS) / PERIOD_MS)
    start = new Date(BASE_MS + (p - BASE_P) * PERIOD_MS)
    dur = PERIOD_MS
  }
  const end = new Date(start.getTime() + dur)
  return {
    id: `P${p}`,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    closeUtc: end.toISOString().slice(11, 16),
    daysLeft: Math.max(1, Math.round((end - t) / 86400000)),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
  try {
    const data = await readCup()
    const period = cupPeriod()
    const leaders = {}
    for (const g of GAMES) {
      const list = data.entries?.[g]?.[period.id] || []
      leaders[g] = [...list].sort((a, b) => b.score - a.score).slice(0, 10)
    }
    const payouts = {}
    for (const g of GAMES) payouts[g] = data.payouts?.[g]?.[period.id] || null
    res.json({
      ok: true,
      period,
      games: GAMES,
      pool: data.pool,
      leaders,
      payouts,
    })
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message.slice(0, 160) })
  }
}
