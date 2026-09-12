/**
 * Wallet signature verification for NimHouse.
 *
 * Primary scheme: the official Nimiq Keyguard "sign message" digest
 * (see nimiq.github.io/hub/api-reference/sign-message):
 *   sign( sha256( "\x16Nimiq Signed Message:\n" + String(message.length) + message ) )
 * Raw-message and keccak256 variants are also accepted for robustness.
 * 0x prefixes are normalized on both sides.
 */
import crypto from 'node:crypto'
import { keccak256 } from 'js-sha3'

/** Nimiq Keyguard message digest: sha256 of the prefixed message. */
export function nimiqMessageDigest(message) {
  const prefixed = Buffer.concat([
    Buffer.from([0x16]),
    Buffer.from(`Nimiq Signed Message:\n${String(message.length)}${message}`, 'utf8'),
  ])
  return crypto.createHash('sha256').update(prefixed).digest()
}

/**
 * @returns {{ ok: boolean, error: string|null }}
 */
export function verifyWalletSignature(message, publicKey, signature) {
  const clean = (h) => String(h || '').replace(/^0x/i, '')
  const pub = Buffer.from(clean(publicKey), 'hex')
  const sig = Buffer.from(clean(signature), 'hex')
  if (pub.length !== 32 || sig.length !== 64)
    return { ok: false, error: `bad key sizes (pub=${pub.length}, sig=${sig.length})` }
  try {
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub])
    const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
    const ok =
      crypto.verify(null, nimiqMessageDigest(message), key, sig) ||
      crypto.verify(null, Buffer.from(keccak256(message)), key, sig) ||
      crypto.verify(null, Buffer.from(message, 'utf8'), key, sig)
    return { ok, error: ok ? null : 'signature invalid' }
  } catch {
    return { ok: false, error: 'signature invalid' }
  }
}
