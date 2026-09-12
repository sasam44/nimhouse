/**
 * POST /api/name/claim — claim (or re-claim) a player name for a device.
 *
 * Body: { name, device, message, publicKey, signature }
 * Message: `NimHouse Name | name=<name> | device=<device>`
 *
 * The claim is verified as a real ed25519 wallet signature (the holder of
 * that key must have approved the name). Storing it in the public
 * data/names.json makes every claim — and every change — auditable.
 *
 * Rules:
 *  - First claim for a device: created.
 *  - Re-claim with the SAME wallet public key: allowed, tracked (changes++).
 *  - Re-claim with a DIFFERENT wallet on the same device: rejected
 *    (the name is locked to the wallet that first claimed it).
 */
import { writeJsonFile } from '../lib/store.js'
import { verifyWalletSignature } from '../lib/verify.js'

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._\-]{0,15}$/

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.status(204).end()
    return
  }
  const bad = (error, status = 400) => res.status(status).json({ ok: false, error })
  try {
    const { name, device, message, publicKey, signature } = req.body || {}
    const clean = (h) => String(h || '').replace(/^0x/i, '')

    const nameC = String(name || '').trim()
    if (!NAME_RE.test(nameC)) return bad('name must be 1–16 chars (letters, numbers, . _ - space)')
    if (!/^[0-9a-f]{64}$/i.test(device || '')) return bad('bad device id')
    if (!publicKey || !signature || typeof message !== 'string') return bad('missing signature')
    if (!message.includes(`name=${nameC}`) || !message.includes(`device=${device}`))
      return bad('message/name mismatch')

    const v = verifyWalletSignature(message, publicKey, signature)
    if (!v.ok) return bad(v.error)

    const deviceKey = device.toLowerCase()
    const pubHex = clean(publicKey).toLowerCase()

    const next = await writeJsonFile('data/names.json', (data) => {
      data.names = data.names || {}
      const existing = data.names[deviceKey]
      if (existing) {
        if (existing.name === nameC) return null // unchanged — no write
        if (existing.pub && pubHex && existing.pub !== pubHex)
          throw new Error('name-locked-to-other-wallet')
        existing.name = nameC
        existing.pub = existing.pub || pubHex
        existing.ts = Date.now()
        existing.changes = (existing.changes || 0) + 1
      } else {
        data.names[deviceKey] = { name: nameC, pub: pubHex, ts: Date.now(), changes: 0 }
      }
      return data
    })

    const claim = next.names[deviceKey]
    res.json({ ok: true, claim, changed: !!(claim.changes > 0 || !claim) })
  } catch (e) {
    if (e.message === 'name-locked-to-other-wallet')
      return bad('name is locked to the wallet that first claimed it on this device', 403)
    if (/cup-not-configured|cup-write-conflict/.test(e.message)) {
      res.status(503).json({ ok: false, error: 'names is being set up — try again shortly' })
    } else {
      res.status(500).json({ ok: false, error: e.message.slice(0, 160) })
    }
  }
}
