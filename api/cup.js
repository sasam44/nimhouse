/**
 * GET /api/cup — current NimHouse Cup state.
 * Returns the active 3-day period, pool config, per-game top-10, and payouts.
 */
import { readCup } from './lib/store.js'

export const GAMES = ['chick', 'stack', 'bull', 'rush', 'swat', 'slice', 'knife']

/**
 * 3-day cup periods (UTC). P{n} covers days [3n, 3n+3) since the epoch.
 * The frontend uses the same function for the signed message, so client and
 * server always agree on the current period.
 */
export function cupPeriod(date = new Date()) {
  const days = Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000
  )
  const p = Math.floor(days / 3)
  const start = new Date(p * 3 * 86400000)
  const end = new Date((p + 1) * 3 * 86400000)
  return {
    id: `P${p}`,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    daysLeft: Math.max(1, Math.ceil((end - date) / 86400000)),
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
