/**
 * POST /api/cup/submit — enter the current 3-day Cup with a wallet-signed score.
 *
 * Body: { game, period, score, name, device, address, message, publicKey, signature }
 *
 * Anti-fraud (documented trust model):
 *  1. The message is verified as a real ed25519 wallet signature (the holder
 *     of that keypair must have approved the claim).
 *  2. One entry per device AND per wallet public key, per game per cup period
 *     (a changed username or a second device with the same wallet does not
 *     create a second rank).
 *  3. Highest score per identity wins (replays are free); the display name
 *     always follows the latest submission.
 *
 * Signature scheme (official Nimiq Keyguard "sign message", see
 * nimiq.github.io/hub/api-reference/sign-message):
 *   sign( sha256( "\x16Nimiq Signed Message:\n" + String(message.length) + message ) )
 * Raw-message and keccak256 variants are also accepted for robustness.
 */
import crypto from 'node:crypto'
import { keccak256 } from 'js-sha3'
import { writeCup } from '../lib/store.js'
import { GAMES, cupPeriod } from '../cup.js'

/** Nimiq Keyguard message digest: sha256 of the prefixed message. */
function nimiqMessageDigest(message) {
  const prefixed = Buffer.concat([
    Buffer.from([0x16]),
    Buffer.from(`Nimiq Signed Message:\n${String(message.length)}${message}`, 'utf8'),
  ])
  return crypto.createHash('sha256').update(prefixed).digest()
}

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

    // Verify the ed25519 signature. Primary scheme: the official Nimiq
    // Keyguard "sign message" digest (sha256 of the prefixed message);
    // raw-message and keccak256 variants are accepted for robustness.
    // 0x prefixes are normalized on both sides.
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
        crypto.verify(null, nimiqMessageDigest(message), key, sig) ||
        crypto.verify(null, Buffer.from(keccak256(message)), key, sig) ||
        crypto.verify(null, Buffer.from(message, 'utf8'), key, sig)
    } catch {
      okSig = false
    }
    if (!okSig) return bad('signature invalid')

    const pubHex = clean(publicKey).toLowerCase()

    const next = await writeCup((data) => {
      const byPeriod = (data.entries[game] = data.entries[game] || {})
      const list = byPeriod[period] || (byPeriod[period] = [])
      const i = list.findIndex((e) => e.device === device || (pubHex && e.pub === pubHex))
      const entry = {
        device,
        name: String(name || 'Anonymous').slice(0, 24),
        score: s,
        address: String(address || '').slice(0, 48),
        pub: pubHex,
        ts: Date.now(),
      }
      if (i >= 0) {
        const existing = list[i]
        // Same wallet key, different device = identity evasion attempt.
        if (existing.device !== device) throw new Error('cup-identity-blocked')
        // Same identity (device + wallet): best score wins, display name
        // always follows the latest submission (rank is preserved).
        list[i] = {
          ...existing,
          name: entry.name,
          address: existing.address || entry.address,
          pub: existing.pub || entry.pub,
          score: Math.max(existing.score, s),
          ts: s > existing.score ? entry.ts : existing.ts,
        }
      } else {
        list.push(entry)
      }
      return data
    })

    const list = next.entries[game][period]
    const top = [...list].sort((a, b) => b.score - a.score)
    const rank = top.findIndex((e) => e.device === device || (pubHex && e.pub === pubHex)) + 1
    const mine = list.find((e) => e.device === device || (pubHex && e.pub === pubHex))
    res.json({ ok: true, rank, score: mine?.score ?? s, period })
  } catch (e) {
    if (e.message === 'cup-identity-blocked')
      return bad('one entry per wallet — this wallet already entered the cup (username changes keep your rank)')
    if (/cup-not-configured|cup-write-conflict/.test(e.message)) {
      res.status(503).json({ ok: false, error: 'cup is being set up — try again shortly' })
    } else {
      res.status(500).json({ ok: false, error: e.message.slice(0, 160) })
    }
  }
}
