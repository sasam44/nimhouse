/**
 * POST /api/cup/payout — record an on-chain payout for a Cup winner.
 * The NimHouse wallet sends the NIM first, then this marks the tx hash so the
 * UI can show "paid ✓". Protected by the CUP_ADMIN_SECRET header.
 *
 * Body: { game, day, rank (1|2|3), tx }
 */
import { writeCup } from '../lib/store.js'
import { GAMES } from '../cup.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-cup-admin')
    res.status(204).end()
    return
  }
  const secret = process.env.CUP_ADMIN_SECRET
  if (!secret || req.headers['x-cup-admin'] !== secret) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return
  }
  try {
    const { game, day, rank, tx } = req.body || {}
    if (!GAMES.includes(game)) return res.status(400).json({ ok: false, error: 'unknown game' })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return res.status(400).json({ ok: false, error: 'bad day' })
    if (![1, 2, 3].includes(Number(rank))) return res.status(400).json({ ok: false, error: 'bad rank' })
    if (!tx) return res.status(400).json({ ok: false, error: 'missing tx hash' })

    await writeCup((data) => {
      const byGame = (data.payouts[game] = data.payouts[game] || {})
      const byDay = byGame[day] || (byGame[day] = {})
      byDay[String(rank)] = String(tx).slice(0, 128)
      return data
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message.slice(0, 160) })
  }
}
