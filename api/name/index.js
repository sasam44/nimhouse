/**
 * GET /api/name?device=<64hex> — look up a device's claimed player name.
 * Returns { ok: true, claim: { name, pub, ts, changes } | null }
 */
import { readJsonFile } from '../lib/store.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const device = String(req.query?.device || '')
  if (!/^[0-9a-f]{64}$/i.test(device)) {
    return res.status(400).json({ ok: false, error: 'bad device id' })
  }
  try {
    const data = await readJsonFile('data/names.json')
    const claim = data.names?.[device.toLowerCase()] || null
    res.json({ ok: true, claim })
  } catch (e) {
    if (/cup-not-configured|cup-write-conflict/.test(e.message)) {
      res.status(503).json({ ok: false, error: 'names is being set up — try again shortly' })
    } else {
      res.status(500).json({ ok: false, error: e.message.slice(0, 160) })
    }
  }
}
