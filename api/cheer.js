/**
 * /api/cheer — public NimHouse cheer (tip) board.
 *
 * GET  → { ok, cheers: [...] }  (newest first)
 * POST → record a cheer after the wallet broadcast its payment:
 *        { name, message, value (Luna), txHash, device?, ts }
 *
 * Transparency model: the ledger is the public `data/cheers.json` file in
 * this repo (auto-committed, inspectable in history). Every entry carries
 * its on-chain tx hash so anyone can verify the payment in the explorer.
 * Entries are client-reported (the wallet itself sends the transaction),
 * de-duplicated per tx hash, and capped — enough for a fair community board.
 */
import { readJsonFile, writeJsonFile } from './lib/store.js'

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._\-]{0,15}$/
const TX_RE = /^0x[0-9a-fA-F]{64}$/
const MAX_VALUE = 1_000_000_000_000 // 10,000,000 NIM — sanity cap
const MAX_ENTRIES = 200

function cleanMsg(m) {
  return String(m ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 60)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    if (req.method === 'GET') {
      const data = await readJsonFile('data/cheers.json')
      const cheers = [...(data.cheers || [])].sort((a, b) => b.ts - a.ts)
      return res.status(200).json({ ok: true, cheers })
    }

    if (req.method === 'POST') {
      const b = req.body || {}
      const name = String(b.name ?? '').trim()
      const message = cleanMsg(b.message)
      const value = Math.floor(Number(b.value))
      const txHash = String(b.txHash ?? '').replace(/^0x/i, '0x')
      const device = String(b.device ?? '').toLowerCase()
      const ts = Math.floor(Number(b.ts))

      if (!NAME_RE.test(name)) return res.status(400).json({ ok: false, error: 'bad name' })
      if (!Number.isFinite(value) || value < 1 || value > MAX_VALUE)
        return res.status(400).json({ ok: false, error: 'bad value' })
      if (!TX_RE.test(txHash)) return res.status(400).json({ ok: false, error: 'bad tx hash' })
      if (device && !/^[0-9a-f]{64}$/.test(device)) return res.status(400).json({ ok: false, error: 'bad device' })
      if (!Number.isFinite(ts) || ts > Date.now() + 60_000) return res.status(400).json({ ok: false, error: 'bad timestamp' })

      const data = await readJsonFile('data/cheers.json', { fresh: true })
      const cheers = data.cheers || []
      if (cheers.some((c) => String(c.txHash).toLowerCase() === txHash.toLowerCase()))
        return res.status(400).json({ ok: false, error: 'this tx is already on the board' })

      const entry = {
        id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name,
        message,
        value,
        device: device || '',
        txHash,
        ts,
      }

      const next = await writeJsonFile('data/cheers.json', (d) => {
        const list = d.cheers || []
        // re-check dedupe on the fresh write
        if (list.some((c) => String(c.txHash).toLowerCase() === txHash.toLowerCase())) return null
        list.push(entry)
        while (list.length > MAX_ENTRIES) list.shift()
        return { ...d, cheers: list }
      })
      if (!next) return res.status(400).json({ ok: false, error: 'this tx is already on the board' })

      return res.status(200).json({ ok: true, entry })
    }

    return res.status(405).json({ ok: false, error: 'method not allowed' })
  } catch (e) {
    const status = e.status || 500
    return res.status(status).json({ ok: false, error: e.message || 'cheer failed' })
  }
}
