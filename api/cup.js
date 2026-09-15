/**
 * GET /api/cup — current NimHouse Cup state.
 * Returns the active 2-day period, pool config, per-game top-10, and payouts.
 */
import { readCup } from './lib/store.js'

export const GAMES = ['chick', 'stack', 'bull', 'rush', 'swat', 'slice', 'dash']

/**
 * Cup grid. Every cup ends at 16:00 UTC and is paid right after (house
 * policy). P6904 (first cup after the P6903 early close) opens
 * 2026-09-15T12:00Z and runs to the next 16:00 UTC anchor; every later cup
 * is 48h on the 16:00 UTC anchor:
 *   P6904      = [2026-09-15T12:00Z, 2026-09-17T16:00Z)
 *   P{n>=6905} = [16:00Z + (n-6905)*48h, +48h)
 * The frontend uses the same function for the signed message, so client and
 * server always agree on the current period.
 */
const PERIOD_MS = 2 * 86400 * 1000 // 2-day cups
const P6904_START = Date.parse('2026-09-15T12:00:00.000Z') // P6904 open
const P6904_END = Date.parse('2026-09-17T16:00:00.000Z') // P6904 close (2 days)
const BASE_MS = P6904_END // anchor for P6905 onward
const BASE_P = 6905
export function cupPeriod(date = new Date()) {
  const t = Date.parse(date)
  let p, start
  if (t >= P6904_START && t < P6904_END) {
    p = 6904
    start = new Date(P6904_START)
  } else if (t < P6904_START) {
    p = 6904 - 1 - Math.floor((P6904_START - 1 - t) / PERIOD_MS)
    start = new Date(P6904_START + (p - 6904) * PERIOD_MS)
  } else {
    p = BASE_P + Math.floor((t - BASE_MS) / PERIOD_MS)
    start = new Date(BASE_MS + (p - BASE_P) * PERIOD_MS)
  }
  const end = new Date(start.getTime() + (p === 6904 ? P6904_END - P6904_START : PERIOD_MS))
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
