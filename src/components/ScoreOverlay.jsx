import { useState } from 'react'

/**
 * Shared "round over" overlay for all games.
 * Handles the wallet-verified score badge + optional NimHouse Cup entry.
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
  onCup,
}) {
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [sig, setSig] = useState(null)
  const [err, setErr] = useState(null)
  const [cupBusy, setCupBusy] = useState(false)
  const [cupDone, setCupDone] = useState(null)
  const [cupErr, setCupErr] = useState(null)

  async function doCup() {
    if (cupBusy || cupDone) return
    setCupBusy(true)
    setCupErr(null)
    try {
      const res = await onCup(score)
      if (res.ok) setCupDone(res.rank ? `#${res.rank} today` : 'saved')
      else setCupErr(res.error || 'Cup entry failed')
    } catch (e) {
      setCupErr(e?.message || 'Cup entry failed')
    } finally {
      setCupBusy(false)
    }
  }

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

      {onCup && !cupDone && (
        <button
          className="btn gold block"
          onClick={doCup}
          disabled={cupBusy}
          title="Signs this score with your Nimiq wallet to enter the daily Cup"
        >
          {cupBusy ? (
            <>
              <span className="spin" /> Signing…
            </>
          ) : (
            <>🏆 Enter the NimHouse Cup</>
          )}
        </button>
      )}
      {cupDone && (
        <div className="cup-line ok">
          🏆 Cup entry saved · {cupDone} <span>(top 3 per game take today's pool)</span>
        </div>
      )}
      {cupErr && <div className="cup-line err">{cupErr}</div>}

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
