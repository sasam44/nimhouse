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
import { writeCup, readJsonFile } from '../lib/store.js'
import { verifyWalletSignature } from '../lib/verify.js'
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
    // Early-close override: pool.closeAt (announced publicly in the ledger).
    // Once reached, no more entries for the current period — payout follows.
    try {
      const cupData = await readJsonFile('data/cup.json')
      const closeAt = Date.parse(cupData.pool?.closeAt || '')
      if (Number.isFinite(closeAt) && Date.now() >= closeAt)
        return bad('this cup closed early — payout in progress, the next cup opens soon')
    } catch {
      /* no closeAt set */
    }
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

    // Verify the ed25519 signature (official Nimiq Keyguard scheme, with
    // raw-message & keccak256 fallbacks — see lib/verify.js).
    const v = verifyWalletSignature(message, publicKey, signature)
    if (!v.ok) return bad(v.error)

    const pubHex = String(publicKey).replace(/^0x/i, '').toLowerCase()

    // Display name: prefer the wallet-claimed name (data/names.json) so the
    // leaderboard identity can't be faked from the client.
    let claimedName = ''
    try {
      const names = await readJsonFile('data/names.json')
      claimedName = names.names?.[String(device).toLowerCase()]?.name || ''
    } catch {
      /* names store unavailable — fall back to submitted name below */
    }

    const next = await writeCup((data) => {
      const byPeriod = (data.entries[game] = data.entries[game] || {})
      const list = byPeriod[period] || (byPeriod[period] = [])
      const i = list.findIndex((e) => e.device === device || (pubHex && e.pub === pubHex))
      const entry = {
        device,
        name: claimedName || String(name || 'Anonymous').slice(0, 24),
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
