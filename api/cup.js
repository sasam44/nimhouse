/**
 * GET /api/cup — current NimHouse Cup state.
 * Returns the active 3-day period, pool config, per-game top-10, and payouts.
 */
import { readCup } from './lib/store.js'

export const GAMES = ['chick', 'stack', 'bull', 'rush', 'swat', 'slice', 'dash']

/**
 * 3-day cup periods. Boundaries at 16:00 UTC (23:00 WIB) so cups close and
 * get paid at a fixed, announced time (house policy).
 * P{n} covers [3n*86400s + 16h, (3n+3)*86400s + 16h).
 * The frontend uses the same function for the signed message, so client and
 * server always agree on the current period.
 */
const PERIOD_MS = 3 * 86400 * 1000
const PERIOD_OFFSET_MS = 16 * 3600 * 1000 // 16:00 UTC = 23:00 WIB
export function cupPeriod(date = new Date()) {
  const t = Date.parse(date)
  const p = Math.max(0, Math.floor((t - PERIOD_OFFSET_MS) / PERIOD_MS))
  const start = new Date(p * PERIOD_MS + PERIOD_OFFSET_MS)
  const end = new Date((p + 1) * PERIOD_MS + PERIOD_OFFSET_MS)
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
