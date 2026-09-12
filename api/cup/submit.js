/**
 * POST /api/cup/submit — enter the daily Cup with a wallet-signed score.
 *
 * Body: { game, day, score, name, device, address, message, publicKey, signature }
 *
 * Anti-fraud (documented trust model):
 *  1. The message is verified as a real ed25519 wallet signature (the holder
 *     of that keypair must have approved the claim).
 *  2. One entry per device per game per day (device = Nimiq device identifier).
 *  3. Highest score per device wins (replays are free).
 */
import crypto from 'node:crypto'
import { keccak256 } from 'js-sha3'
import { writeCup } from '../lib/store.js'
import { GAMES } from '../cup.js'

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
    const { game, day, score, name, device, address, message, publicKey, signature } = req.body || {}

    if (!GAMES.includes(game)) return bad('unknown game')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return bad('bad day')
    const s = Math.floor(Number(score))
    if (!Number.isFinite(s) || s < 0 || s > 1_000_000) return bad('bad score')
    if (!/^[0-9a-f]{64}$/i.test(device || '')) return bad('bad device id')
    if (!publicKey || !signature || typeof message !== 'string') return bad('missing signature')
    if (!message.includes(`score=${s}`) || !message.includes(`game=${game}`)) return bad('message/score mismatch')

    // Nimiq wallet signs keccak256(message) with ed25519.
    const msgHash = Buffer.from(keccak256(message))
    const pub = Buffer.from(publicKey, 'hex')
    const sig = Buffer.from(signature, 'hex')
    if (pub.length !== 32 || sig.length !== 64) return bad('bad key sizes')
    let okSig = false
    try {
      const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub])
      const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
      okSig = crypto.verify(null, msgHash, key, sig)
    } catch {
      okSig = false
    }
    if (!okSig) return bad('signature invalid')

    const next = await writeCup((data) => {
      const byDay = (data.entries[game] = data.entries[game] || {})
      const list = byDay[day] || (byDay[day] = [])
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

    const list = next.entries[game][day]
    const top = [...list].sort((a, b) => b.score - a.score)
    const rank = top.findIndex((e) => e.device === device) + 1
    res.json({ ok: true, rank, score: s })
  } catch (e) {
    if (/cup-not-configured|cup-write-conflict/.test(e.message)) {
      res.status(503).json({ ok: false, error: 'cup is being set up — try again shortly' })
    } else {
      res.status(500).json({ ok: false, error: e.message.slice(0, 160) })
    }
  }
}
