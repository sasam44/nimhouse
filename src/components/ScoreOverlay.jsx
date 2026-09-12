import { useState } from 'react'

/**
 * Shared "round over" overlay for all three games.
 * Handles the wallet-verified score badge flow.
 */
export default function ScoreOverlay({
  gameLabel,
  score,
  best,
  isBest,
  quote,
  rankLine,
  onReplay,
  onExit,
  requestVerify,
  entryId,
  walletMode,
}) {
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [sig, setSig] = useState(null)
  const [err, setErr] = useState(null)

  async function doVerify() {
    if (!entryId || verifying || verified) return
    setVerifying(true)
    setErr(null)
    try {
      const res = await requestVerify(entryId)
      if (res.ok) {
        setVerified(true)
        setSig(res.signature)
      } else {
        setErr(res.error || 'Verification failed')
      }
    } catch (e) {
      setErr(e?.message || 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="panel">
      {isBest && <span className="new-best">★ NEW BEST</span>}
      <div className="score-big">{score}</div>
      <div className="score-best">
        Best {best} {rankLine ? ` · ${rankLine}` : ''}
      </div>
      <div className="quote">{quote}</div>

      {!verified && (
        <button
          className="btn ghost block"
          onClick={doVerify}
          disabled={verifying || !entryId}
          title="Signs a record of this score with your Nimiq wallet"
        >
          {verifying ? (
            <>
              <span className="spin" /> Signing…
            </>
          ) : (
            <>✓ Verify score with wallet{walletMode === 'demo' ? ' (demo)' : ''}</>
          )}
        </button>
      )}
      {verified && (
        <div>
          <div>
            <span className="badge verified">✓ WALLET-VERIFIED</span>
          </div>
          <div className="verified-line">sig {String(sig || '').slice(0, 18)}…</div>
        </div>
      )}
      {err && <div className="quote">{err}</div>}

      <div className="btns">
        <div className="row">
          <button className="btn primary" onClick={onReplay}>
            ↺ Play again
          </button>
          <button className="btn ghost" onClick={onExit}>
            ← Back to house
          </button>
        </div>
        <div className="panel-hint">{gameLabel} · 100% skill</div>
      </div>
    </div>
  )
}
