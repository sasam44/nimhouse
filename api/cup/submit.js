/**
 * POST /api/cup/submit — enter the current 3-day Cup with a wallet-signed score.
 *
 * Body: { game, period, score, name, device, address, message, publicKey, signature }
 *
 * Anti-fraud (documented trust model):
 *  1. The message is verified as a real ed25519 wallet signature (the holder
 *     of that keypair must have approved the claim).
 *  2. One entry per device per game per cup period.
 *  3. Highest score per device wins (replays are free).
 */
import crypto from 'node:crypto'
import { keccak256 } from 'js-sha3'
import { writeCup } from '../lib/store.js'
import { GAMES, cupPeriod } from '../cup.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.status(204).end()
    return
  }
  const bad = (error) => res.status(400).json({ ok: false, error })
  try {
    const { game, period, score, name, device, address, message, publicKey, signature } =
      req.body || {}

    if (!GAMES.includes(game)) return bad('unknown game')
    if (!/^P\d+$/.test(period || '')) return bad('bad period')
    if (period !== cupPeriod().id) return bad('cup period closed')
    const s = Math.floor(Number(score))
    if (!Number.isFinite(s) || s < 0 || s > 1_000_000) return bad('bad score')
    if (!/^[0-9a-f]{64}$/i.test(device || '')) return bad('bad device id')
    if (!publicKey || !signature || typeof message !== 'string') return bad('missing signature')
    if (
      !message.includes(`score=${s}`) ||
      !message.includes(`game=${game}`) ||
      !message.includes(`period=${period}`)
    )
      return bad('message/score mismatch')

    // Nimiq wallets sign the message with ed25519. Depending on the
    // provider build the signed payload is either the raw message or
    // keccak256(message) — accept whichever verifies. (0x prefixes are
    // normalized on both sides.)
    const clean = (h) => String(h || '').replace(/^0x/i, '')
    const pub = Buffer.from(clean(publicKey), 'hex')
    const sig = Buffer.from(clean(signature), 'hex')
    if (pub.length !== 32 || sig.length !== 64)
      return bad(`bad key sizes (pub=${pub.length}, sig=${sig.length})`)
    let okSig = false
    try {
      const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub])
      const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
      okSig =
        crypto.verify(null, Buffer.from(keccak256(message)), key, sig) ||
        crypto.verify(null, Buffer.from(message, 'utf8'), key, sig)
    } catch {
      okSig = false
    }
    if (!okSig) return bad('signature invalid')

    const next = await writeCup((data) => {
      const byPeriod = (data.entries[game] = data.entries[game] || {})
      const list = byPeriod[period] || (byPeriod[period] = [])
      const entry = {
        device,
        name: String(name || 'Anonymous').slice(0, 24),
        score: s,
        address: String(address || '').slice(0, 48),
        ts: Date.now(),
      }
      const i = list.findIndex((e) => e.device === device)
      if (i >= 0) {
        if (s > list[i].score) list[i] = { ...list[i], ...entry }
      } else {
        list.push(entry)
      }
      return data
    })

    const list = next.entries[game][period]
    const top = [...list].sort((a, b) => b.score - a.score)
    const rank = top.findIndex((e) => e.device === device) + 1
    res.json({ ok: true, rank, score: s, period })
  } catch (e) {
    if (/cup-not-configured|cup-write-conflict/.test(e.message)) {
      res.status(503).json({ ok: false, error: 'cup is being set up — try again shortly' })
    } else {
      res.status(500).json({ ok: false, error: e.message.slice(0, 160) })
    }
  }
}
