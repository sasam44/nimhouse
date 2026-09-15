/**
 * GET /api/cup — current NimHouse Cup state.
 * Returns the active 2-day period, pool config, per-game top-10, and payouts.
 */
import { readCup } from './lib/store.js'

export const GAMES = ['chick', 'stack', 'bull', 'rush', 'swat', 'slice', 'dash']

/**
 * 2-day cup periods. Every cup ends at 16:00 UTC (23:00 WIB) and is paid
 * right after (house policy). Grid anchored at P6904 = 2026-09-15T16:00Z.
 * P{n} covers [BASE + (n-6904)*48h, +48h).
 * The frontend uses the same function for the signed message, so client and
 * server always agree on the current period.
 */
const PERIOD_MS = 2 * 86400 * 1000 // 2-day cups
const BASE_MS = Date.parse('2026-09-15T16:00:00.000Z') // P6904 start (23:00 WIB)
const BASE_P = 6904
export function cupPeriod(date = new Date()) {
  const t = Date.parse(date)
  const p =
    t < BASE_MS
      ? BASE_P - 1 - Math.floor((BASE_MS - 1 - t) / PERIOD_MS)
      : BASE_P + Math.floor((t - BASE_MS) / PERIOD_MS)
  const start = new Date(BASE_MS + (p - BASE_P) * PERIOD_MS)
  const end = new Date(start.getTime() + PERIOD_MS)
  return {
    id: `P${p}`,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    closeWib: new Date(end.getTime() + 7 * 3600 * 1000).toISOString().slice(11, 16),
    daysLeft: Math.max(1, Math.ceil((end - t) / 86400000)),
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
