import { useEffect, useMemo, useRef, useState } from 'react'
import { getWallet, getDeviceId, CHEER_ADDRESS, LUNA_PER_NIM, fmtNim, shortHash } from './wallet'
import { SKIN_GROUPS } from './skins'
import {
  drawChicken,
  drawDart,
  drawStackPreview,
  drawBoardPreview,
  drawRushPreview,
  drawSwatPreview,
  drawSlicePreview,
  drawDashPreview,
} from './sketch'
import chickUrl from './assets/chick.png'
import { loadLB, bestScore, markVerified } from './leaderboard'
import { sfx } from './sound'
import NimChick from './games/NimChick'
import NimStack from './games/NimStack'
import NimBullseye from './games/NimBullseye'
import NimRush from './games/NimRush'
import NimSwat from './games/NimSwat'
import NimSlice from './games/NimSlice'
import NimDash from './games/NimDash'

const GAMES = [
  {
    id: 'chick',
    name: 'NimChick',
    blurb: 'Flap an absurd mustached chicken through endless pipes. Classic flapper, zero mercy.',
    how: 'tap to flap',
    lbLabel: 'Chick',
  },
  {
    id: 'stack',
    name: 'NimStack',
    blurb: 'Stack blocks with pixel-perfect precision. Every overhang gets sliced off.',
    how: 'tap to drop',
    lbLabel: 'Stack',
  },
  {
    id: 'bull',
    name: 'NimBullseye',
    blurb: 'Five levels of swaying & moving boards. The dart lands exactly where your crosshair is.',
    how: 'hold + release',
    lbLabel: 'Bullseye',
  },
  {
    id: 'rush',
    name: 'NimRush',
    blurb: 'Pseudo-3D road, full speed, zero brakes. Weave through cows, UFOs & giant sausages.',
    how: 'tap left / right',
    lbLabel: 'Rush',
  },
  {
    id: 'swat',
    name: 'NimSwat',
    blurb: 'One angry fly with a mustache. Tap it before it gets too fast. 5 misses = it escapes.',
    how: 'tap the fly',
    lbLabel: 'Swat',
  },
  {
    id: 'slice',
    name: 'NimSlice',
    blurb: 'Sausage volleys incoming — swipe to slice them all. Never the black one.',
    how: 'swipe to slice',
    lbLabel: 'Slice',
  },
  {
    id: 'dash',
    name: 'NimDash',
    blurb: 'Sprint, jump & mid-air FLAP over blocks, pits & mustachioed flies. Stomp flies, grab Luna coins.',
    how: 'tap = jump · tap mid-air = flap',
    lbLabel: 'Dash',
  },
]

const shortAddr = (a) => {
  if (!a) return ''
  const s = a.replace(/\s/g, '')
  return `${s.slice(0, 10)}…${s.slice(-6)}`
}

function Logo() {
  return (
    <div className="logo-badge">
      <img className="logo-chick" src={chickUrl} alt="NimHouse chick" draggable="false" />
    </div>
  )
}

function GameThumb({ kind, skin, dartSkin }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, 76, 76)
    if (kind === 'chick') drawChicken(ctx, 36, 46, 1.05, skin, 0.6, 0.9)
    else if (kind === 'stack') drawStackPreview(ctx, skin?.hue ?? 158, 76, 76)
    else if (kind === 'bull') drawBoardPreview(ctx, 76, 76, dartSkin)
    else if (kind === 'rush') drawRushPreview(ctx, 76, 76, skin)
    else if (kind === 'swat') drawSwatPreview(ctx, 76, 76)
    else if (kind === 'dash') drawDashPreview(ctx, 76, 76, skin)
    else drawSlicePreview(ctx, 76, 76, skin)
  }, [kind, skin, dartSkin])
  return <canvas ref={ref} className="game-thumb" width={76} height={76} />
}

function SkinThumb({ group, skin }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, 52, 52)
    if (group === 'chick') drawChicken(ctx, 24, 30, 0.72, skin, 0.6, 0.8)
    else if (group === 'dart') drawDart(ctx, 26, 28, 0, skin, 1.05)
    else drawStackPreview(ctx, skin?.hue ?? 158, 52, 52)
  }, [group, skin])
  return <canvas ref={ref} width={52} height={52} />
}

const CUP_NAMES = {
  chick: 'NimChick',
  stack: 'NimStack',
  bull: 'NimBullseye',
  rush: 'NimRush',
  swat: 'NimSwat',
  slice: 'NimSlice',
  dash: 'NimDash',
}

function CheerBoard({ tick }) {
  const [cheers, setCheers] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (typeof fetch === 'undefined') {
      setFailed(true)
      return
    }
    let alive = true
    // fresh=1 after a cheer: bypass any stale per-instance cache
    fetch(tick > 0 ? '/api/cheer?fresh=1' : '/api/cheer')
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        if (j.ok) {
          setCheers(j.cheers)
          setFailed(false)
        } else setFailed(true)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [tick])

  if (!cheers && !failed) return <div className="cup-note">Loading the cheer board…</div>
  if (failed || cheers.length === 0)
    return (
      <div className="cup-note">
        {cheers && cheers.length === 0 ? (
          <>No cheers on the board yet — be the first to cheer the house 🐔</>
        ) : (
          'Cheer board unavailable right now.'
        )}
      </div>
    )

  const top = [...cheers].sort((a, b) => b.value - a.value).slice(0, 3)
  const recent = cheers.slice(0, 6)
  return (
    <div className="cheer-board">
      {top.length > 0 && (
        <>
          <div className="menu-sub">Top cheers</div>
          {top.map((c, i) => (
            <div className="cheer-row" key={c.id + 'top'}>
              <b>{['🥇', '🥈', '🥉'][i]}</b> {c.name} <b>{fmtNim(c.value)}</b>
              {c.message && <span className="cheer-quote"> “{c.message}”</span>}
            </div>
          ))}
        </>
      )}
      <div className="menu-sub">Latest words</div>
      {recent.map((c) => (
        <div className="cheer-row" key={c.id}>
          <span>{c.name}</span>
          <span className="cheer-amount">{fmtNim(c.value)}</span>
          {c.message && <span className="cheer-quote">“{c.message}”</span>}
          <span className="cheer-hash" title="on-chain tx hash">
            tx {String(c.txHash).slice(0, 6)}…{String(c.txHash).slice(-4)}
          </span>
        </div>
      ))}
      <p className="cup-note">
        Every cheer is a real NIM payment to the NimHouse community wallet — the full public
        ledger lives in the open-source repo; verify any entry by its on-chain tx hash.
      </p>
    </div>
  )
}

/** Local, per-device record of Cup entries (for the profile's win history). */
function recordCupResult(game, periodId, score, rank) {
  try {
    const parsed = JSON.parse(localStorage.getItem('nimhouse.cup') || '[]')
    const list = Array.isArray(parsed) ? parsed : []
    list.unshift({ game, period: periodId, score, rank, ts: Date.now() })
    const next = list.slice(0, 30)
    localStorage.setItem('nimhouse.cup', JSON.stringify(next))
    return next
  } catch {
    return []
  }
}

/** Cup grid (P6904: 2026-09-15T12:00Z → 2026-09-17T16:00Z; then 48h on the
 *  16:00 UTC anchor) — must stay in sync with api/cup.js */
const PERIOD_MS = 2 * 86400 * 1000 // 2-day cups
const P6904_START = Date.parse('2026-09-15T12:00:00.000Z') // P6904 open
const P6904_END = Date.parse('2026-09-17T16:00:00.000Z') // P6904 close (2 days)
const BASE_MS = P6904_END // anchor for P6905 onward
const BASE_P = 6905
function cupPeriod(date = new Date()) {
  const t = Date.parse(date)
  let p, start
  if (t >= P6904_START && t < P6904_END) {
    p = 6904
    start = new Date(P6904_START)
  } else if (t < P6904_START) {
    p = 6904 - 1 - Math.floor((P6904_START - 1 - t) / PERIOD_MS)
    start = new Date(P6904_START + (p - 6904) * PERIOD_MS)
  } else {
    p = BASE_P + Math.floor((t - BASE_MS) / PERIOD_MS)
    start = new Date(BASE_MS + (p - BASE_P) * PERIOD_MS)
  }
  const end = new Date(start.getTime() + (p === 6904 ? P6904_END - P6904_START : PERIOD_MS))
  return {
    id: `P${p}`,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    closeUtc: end.toISOString().slice(11, 16),
    daysLeft: Math.max(1, Math.round((end - t) / 86400000)),
    startMs: start.getTime(),
    endMs: end.getTime(),
  }
}

function CupCard({ tick }) {
  const [cup, setCup] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (typeof fetch === 'undefined') {
      setFailed(true)
      return
    }
    let alive = true
    fetch('/api/cup')
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        if (j.ok) {
          setCup(j)
          setFailed(false)
        } else setFailed(true)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [tick])

  const pool = cup?.pool
  const walletReady = pool?.wallet && !/PENDING/.test(pool.wallet)
  // Close labels — states:
  //  1. current grid cup already closed & paid (pool.closedPeriods) → point
  //     at the next cup's open time;
  //  2. an early close inside the current window (pool.closeAt before the
  //     grid end) → "closes EARLY";
  //  3. normal countdown to the grid end (16:00 UTC).
  const closeAt = Date.parse(pool?.closeAt || '')
  const curClosed = !!(cup?.period && pool?.closedPeriods?.[cup.period.id])
  const normalLabel = `closes ${cup?.period?.end ?? '…'} · ${cup?.period?.closeUtc ?? '16:00'} UTC (${cup?.period?.daysLeft ?? '…'}d left)`
  let closeLabel = normalLabel
  if (curClosed && cup?.period?.endMs) {
    const nextOpen = new Date(cup.period.endMs)
    closeLabel = `closed — paid on-chain ✓ · next cup opens ${nextOpen.toISOString().slice(0, 10)} · ${nextOpen.toISOString().slice(11, 16)} UTC`
  } else if (Number.isFinite(closeAt)) {
    if (closeAt > Date.now() && closeAt < (cup?.period?.endMs ?? Infinity))
      closeLabel = `closes EARLY ${new Date(closeAt).toISOString().slice(0, 10)} · ${new Date(closeAt)
        .toISOString()
        .slice(11, 16)} UTC (${Math.ceil((closeAt - Date.now()) / 3600000)}h left) — payout follows`
    else if (closeAt > Date.now()) closeLabel = normalLabel
    else closeLabel = 'closed — payout in progress'
  }
  return (
    <div className="card cup-card">
      <h3>
        🏆 NimHouse Cup — {cup?.period?.id || '…'}
        <span className="cup-period">{' '}</span>
        <span className="cup-period">· {closeLabel}</span>
      </h3>
      <p className="cup-pool">
        {pool?.perGameDailyNim ?? 100} NIM per game per 2-day cup · top 3 take{' '}
        {pool?.splitPct?.join(' / ') ?? '50 / 30 / 20'}% · staked by the <b>NimHouse wallet</b>
        {walletReady && <span className="cup-wallet"> · {pool.wallet.slice(0, 6)}…{pool.wallet.slice(-4)}</span>}
      </p>
      {cup ? (
        <div className="cup-board">
          {cup.games.map((g) => {
            const top = cup.leaders[g] || []
            const paid = cup.payouts[g]
            return (
              <div className="cup-row" key={g}>
                <div className="cup-game">{CUP_NAMES[g]}</div>
                <div className="cup-top">
                  {top.length === 0 && <span className="cup-empty">no entries yet — be first</span>}
                  {top.slice(0, 3).map((e, i) => (
                    <span className="cup-medal" key={e.device} title={e.device}>
                      <b>{['🥇', '🥈', '🥉'][i]}</b> {e.name} <b>{e.score}</b>
                    </span>
                  ))}
                  {paid && <span className="badge verified">paid ✓</span>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        !failed && (
          <div className="cup-note">
            Loading today's board…
          </div>
        )
      )}
      <p className="cup-note">
        Free to play · no entry fee, no gambling. Finish any game → <b>Enter the NimHouse Cup</b>{' '}
        (signs with your Nimiq wallet). One entry per device per game per 2-day cup — best score
        counts. Top 3 per game get paid on-chain at the end of each cup. Pool, entries &amp;
        payouts are public in the open-source repo.
      </p>
    </div>
  )
}

function MenuPanel({
  wallet,
  connected,
  connecting,
  connectErr,
  chain,
  accounts,
  bests,
  cupHistory,
  claim,
  claimBusy,
  claimEditing,
  draftName,
  onDraftName,
  onClaim,
  onClaimEdit,
  onClaimCancel,
  onConnect,
  onDisconnect,
  onRefreshChain,
  onClose,
}) {
  return (
    <>
      <div className="menu-backdrop" onClick={onClose} />
      <div className="menu-panel">
        <div className="menu-head">
          <b>🐔 NimHouse</b>
          <button className="menu-close" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="menu-section">
          <div className="menu-label">Player</div>
          {claim && !claimEditing ? (
            <div>
              <div className="player-claimed">
                <b>{claim.name}</b>
                <span className="badge verified">🔒 signed</span>
              </div>
              <div className="wallet-meta">
                Claimed by your wallet{claim.changes ? ` · changed ${claim.changes}×` : ''}. This is
                your Cup identity.
              </div>
              <button className="btn small ghost" onClick={onClaimEdit} disabled={claimBusy}>
                ✎ Change name (signs again)
              </button>
            </div>
          ) : (
            <div>
              <input
                className="name-input"
                value={draftName}
                placeholder="Choose a gamertag (1–16)"
                maxLength={16}
                onChange={(e) => onDraftName(e.target.value)}
              />
              <button
                className="btn primary block"
                disabled={claimBusy || !draftName.trim()}
                onClick={() => onClaim(draftName)}
              >
                {claimBusy ? (
                  <>
                    <span className="spin" /> Signing…
                  </>
                ) : claim ? (
                  'Submit new name'
                ) : (
                  'Submit name'
                )}
              </button>
              {claimEditing && (
                <button className="btn small ghost" onClick={onClaimCancel} disabled={claimBusy}>
                  Cancel
                </button>
              )}
              <div className="wallet-meta">
                {claim
                  ? 'Changing your name requires a new wallet signature.'
                  : 'Submitting signs your name with your wallet — it becomes your Cup identity.'}
              </div>
            </div>
          )}
          <div className="menu-sub">Cup entries — your wins at the NimHouse</div>
          {cupHistory.length === 0 ? (
            <div className="cup-note">
              No cup entries yet — finish a game, then hit <b>Enter the NimHouse Cup</b>.
            </div>
          ) : (
            cupHistory.slice(0, 12).map((h, i) => (
              <div className="cup-hist-row" key={h.ts + '-' + i}>
                <span>{['🥇', '🥈', ''][h.rank - 1] || `#${h.rank}`}</span>
                <b>{CUP_NAMES[h.game] || h.game}</b>
                <span className="cup-hist-dim">{h.period}</span>
                <span className="cup-hist-score">{h.score}</span>
              </div>
            ))
          )}
        </div>

        <div className="menu-section">
          <div className="menu-label">Best scores · this device</div>
          <div className="best-grid">
            {Object.entries(bests).map(([g, s]) => (
              <span className="best-chip" key={g}>
                {CUP_NAMES[g] || g} <b>{s}</b>
              </span>
            ))}
          </div>
        </div>

        <div className="menu-section">
          <div className="menu-label">
            Nimiq Pay wallet
            {wallet && (
              <span className={`badge ${wallet.mode}`}>{wallet.mode === 'live' ? 'LIVE' : 'DEMO'}</span>
            )}
          </div>
          {!wallet ? (
            <div className="wallet-meta">
              <span className="spin" /> Detecting Nimiq Pay…
            </div>
          ) : !connected ? (
            <div>
              {wallet.mode === 'demo' && (
                <div className="wallet-meta" style={{ marginBottom: 10 }}>
                  Running outside Nimiq Pay, so wallet actions are <b>simulated</b>. Open inside
                  Nimiq Pay for real NIM payments.
                </div>
              )}
              <button className="btn primary block" onClick={onConnect} disabled={connecting}>
                {connecting ? (
                  <>
                    <span className="spin" /> Connecting…
                  </>
                ) : (
                  'Connect wallet'
                )}
              </button>
              {connectErr && (
                <div className="wallet-meta" style={{ color: 'var(--red)' }}>
                  {connectErr}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="wallet-addr">{shortAddr(accounts?.[0])}</div>
              <div className="wallet-meta">
                Block {chain ? (chain.block || 0).toLocaleString() : '…'} · consensus{' '}
                {chain && chain.consensus ? 'established ✓' : 'checking…'}
              </div>
              <div className="wallet-actions">
                <button className="btn small ghost" onClick={onRefreshChain}>
                  ↻ Refresh status
                </button>
                <button className="btn small ghost" onClick={onDisconnect}>
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default function App() {
  const [wallet, setWallet] = useState(null)
  const [view, setView] = useState('hub')
  const [menuOpen, setMenuOpen] = useState(false)
  const [claim, setClaim] = useState(null)
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimEditing, setClaimEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [cupHistory, setCupHistory] = useState(() => {
    try {
      const h = JSON.parse(localStorage.getItem('nimhouse.cup') || '[]')
      if (Array.isArray(h)) return h
    } catch {
      /* ignore */
    }
    return []
  })

  // wallet
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [accounts, setAccounts] = useState(null)
  const [chain, setChain] = useState(null)
  const [connectErr, setConnectErr] = useState(null)

  // player + skins
  const [player, setPlayer] = useState(() => localStorage.getItem('nimhouse.player') || '')
  const [owned, setOwned] = useState(() => {
    try {
      const o = JSON.parse(localStorage.getItem('nimhouse.owned'))
      if (o && o.chick && o.dart && o.stack) return o
    } catch {
      /* ignore */
    }
    return { chick: ['classic'], dart: ['classic'], stack: ['mint'] }
  })
  const [sel, setSel] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('nimhouse.sel'))
      if (s && s.chick && s.dart && s.stack) return s
    } catch {
      /* ignore */
    }
    return { chick: 'classic', dart: 'classic', stack: 'mint' }
  })
  const [busy, setBusy] = useState(null)
  const [lastTx, setLastTx] = useState(null)
  const [cheerMsg, setCheerMsg] = useState('')
  const [lbTab, setLbTab] = useState('chick')
  const [lbTick, setLbTick] = useState(0)
  const [cheerTick, setCheerTick] = useState(0)

  // toast
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  function toastMsg(msg, err = false) {
    setToast({ msg, err })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3400)
  }

  useEffect(() => {
    getWallet().then(setWallet)
    return () => clearTimeout(toastTimer.current)
  }, [])

  // Look up this device's claimed name (public registry in the repo).
  useEffect(() => {
    if (typeof fetch === 'undefined') return
    let alive = true
    getDeviceId()
      .then((dev) => fetch(`/api/name?device=${dev}`))
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j.ok || !j.claim) return
        setClaim(j.claim)
        setPlayer((p) => {
          localStorage.setItem('nimhouse.player', j.claim.name)
          return j.claim.name
        })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // Claim (or re-claim) the player name with a wallet signature.
  async function submitClaim(rawName) {
    if (!wallet || claimBusy) return
    const nm = String(rawName || '').trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._\-]{0,15}$/.test(nm)) {
      toastMsg('Name: 1–16 chars — letters, numbers, space, . _ -', true)
      return
    }
    if (wallet.mode === 'demo') {
      setPlayer(nm)
      localStorage.setItem('nimhouse.player', nm)
      setClaimEditing(false)
      toastMsg(`Demo mode: “${nm}” saved on this device only`)
      return
    }
    setClaimBusy(true)
    try {
      const device = await getDeviceId()
      const message = `NimHouse Name | name=${nm} | device=${device}`
      const res = await wallet.nimiq.sign(message)
      if (res && res.error) throw new Error(res.error.message || 'Signing rejected')
      const r = await fetch('/api/name/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nm,
          device,
          message,
          publicKey: String(res.publicKey).replace(/^0x/i, ''),
          signature: String(res.signature).replace(/^0x/i, ''),
        }),
      })
      const j = await r.json().catch(() => ({ ok: false, error: 'network error' }))
      if (!j.ok) throw new Error(j.error || 'Name claim failed')
      setClaim(j.claim)
      setPlayer(nm)
      localStorage.setItem('nimhouse.player', nm)
      setClaimEditing(false)
      setLbTick((t) => t + 1)
      toastMsg(
        j.claim.changes > 0
          ? `Name updated to “${nm}” 📝`
          : `Name “${nm}” signed & locked to your wallet 🔒`
      )
    } catch (e) {
      toastMsg(e?.message || 'Name claim failed', true)
    } finally {
      setClaimBusy(false)
    }
  }

  useEffect(() => {
    localStorage.setItem('nimhouse.owned', JSON.stringify(owned))
  }, [owned])
  useEffect(() => {
    localStorage.setItem('nimhouse.sel', JSON.stringify(sel))
  }, [sel])

  // ---------------- wallet actions ----------------
  async function connect() {
    if (!wallet || connecting) return
    setConnecting(true)
    setConnectErr(null)
    try {
      const res = await wallet.nimiq.listAccounts()
      if (res && res.error) throw new Error(res.error.message || 'Permission denied')
      const accs = Array.isArray(res) ? res : []
      if (!accs.length) throw new Error('No accounts found in Nimiq Pay')
      const [consensus, block] = await Promise.all([
        wallet.nimiq.isConsensusEstablished(),
        wallet.nimiq.getBlockNumber(),
      ])
      setAccounts(accs)
      setChain({ consensus: consensus === true, block })
      setConnected(true)
      sfx.pop()
    } catch (e) {
      setConnectErr(e?.error?.message || e?.message || 'Could not connect to the wallet')
    } finally {
      setConnecting(false)
    }
  }

  async function refreshChain() {
    if (!wallet) return
    try {
      const [consensus, block] = await Promise.all([
        wallet.nimiq.isConsensusEstablished(),
        wallet.nimiq.getBlockNumber(),
      ])
      setChain({ consensus: consensus === true, block })
    } catch {
      /* keep old values */
    }
  }

  function disconnect() {
    setConnected(false)
    setAccounts(null)
    setChain(null)
  }

  async function verifyScore(game, entryId) {
    if (!wallet) return { ok: false, error: 'Wallet not ready yet' }
    const payload = JSON.stringify({
      app: 'NimHouse',
      game,
      entryId,
      player: player || 'Anonymous',
      ts: Date.now(),
    })
    try {
      const res = await wallet.nimiq.sign(payload)
      if (res && res.error) return { ok: false, error: res.error.message || 'Signing rejected' }
      markVerified(game, entryId)
      setLbTick((t) => t + 1)
      return { ok: true, signature: res.signature }
    } catch (e) {
      return { ok: false, error: e?.message || 'Signing failed' }
    }
  }

  async function cupSubmit(game, score) {
    if (!wallet || wallet.mode === 'demo') return { ok: false, error: 'Open inside Nimiq Pay to enter the Cup' }
    const period = cupPeriod()
    try {
      const device = await getDeviceId()
      const message = `NimHouse Cup | game=${game} | period=${period.id} | score=${Math.floor(score)} | device=${device}`
      const res = await wallet.nimiq.sign(message)
      if (res && res.error) return { ok: false, error: res.error.message || 'Signing rejected' }
      const body = {
        game,
        period: period.id,
        score: Math.floor(score),
        name: player || 'Anonymous',
        device,
        address: Array.isArray(accounts) && accounts[0] ? accounts[0] : '',
        message,
        publicKey: res.publicKey,
        signature: res.signature,
      }
      const r = await fetch('/api/cup/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await r.json().catch(() => ({ ok: false, error: 'network error' }))
      if (json.ok) setCupHistory(recordCupResult(game, period.id, json.score, json.rank))
      setLbTick((t) => t + 1)
      return json
    } catch (e) {
      return { ok: false, error: e?.message || 'Cup entry failed' }
    }
  }

  // ---------------- shop ----------------
  function selectSkin(group, id) {
    setSel((s) => ({ ...s, [group]: id }))
    sfx.pop()
  }

  async function buySkin(groupId, skin) {
    if (!wallet) return
    if (owned[groupId]?.includes(skin.id)) {
      selectSkin(groupId, skin.id)
      return
    }
    const key = groupId + ':' + skin.id
    setBusy(key)
    try {
      if (skin.price === 0) {
        setOwned((o) => ({ ...o, [groupId]: [...o[groupId], skin.id] }))
        selectSkin(groupId, skin.id)
        toastMsg(`Equipped ${skin.name}`)
        return
      }
      const hash = await wallet.nimiq.sendBasicTransactionWithData({
        recipient: CHEER_ADDRESS,
        value: skin.price,
        data: `NimHouse purchase: ${skin.name} (cosmetic only)`,
      })
      if (hash && hash.error) throw new Error(hash.error.message || 'Transaction failed')
      setOwned((o) => ({ ...o, [groupId]: [...o[groupId], skin.id] }))
      selectSkin(groupId, skin.id)
      setLastTx(`Paid ${fmtNim(skin.price)} · ${shortHash(hash)}`)
      sfx.buy()
      toastMsg(
        wallet.mode === 'demo'
          ? `Simulated NIM payment (demo mode): ${skin.name}`
          : `Purchased ${skin.name} with NIM`
      )
    } catch (e) {
      toastMsg(e?.error?.message || e?.message || 'Transaction failed', true)
    } finally {
      setBusy(null)
    }
  }

  // ---------------- cheer ----------------
  async function cheer(amountNim) {
    if (!wallet || !connected) return
    const value = Math.round(amountNim * LUNA_PER_NIM)
    const key = 'cheer' + amountNim
    setBusy(key)
    try {
      const msg = (cheerMsg.trim() || 'let’s go').slice(0, 60)
      const data = `NimHouse cheer for ${player || 'the house'}: ${msg}`
      const hash = await wallet.nimiq.sendBasicTransactionWithData({
        recipient: CHEER_ADDRESS,
        value,
        data,
      })
      if (hash && hash.error) throw new Error(hash.error.message || 'Transaction failed')
      setLastTx(`Cheer sent · ${shortHash(hash)}`)
      // publish to the public cheer board (best-effort — the payment is on-chain either way)
      if (wallet.mode === 'live') {
        getDeviceId().then(async (device) => {
          try {
            await fetch('/api/cheer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: player || 'Anonymous',
                message: msg,
                value,
                txHash: hash,
                device,
                ts: Date.now(),
              }),
            })
            setCheerTick((t) => t + 1)
          } catch {
            /* board sync failed silently — tx hash remains verifiable */
          }
        })
      }
      sfx.win()
      toastMsg(
        wallet.mode === 'demo'
          ? `Simulated cheer (demo mode): ${fmtNim(value)}`
          : `Cheered the house with ${fmtNim(value)} 🎉`
      )
    } catch (e) {
      toastMsg(e?.error?.message || e?.message || 'Transaction failed', true)
    } finally {
      setBusy(null)
    }
  }

  // ---------------- derived ----------------
  const bests = useMemo(
    () => ({
      chick: bestScore('chick'),
      stack: bestScore('stack'),
      bull: bestScore('bull'),
      rush: bestScore('rush'),
      swat: bestScore('swat'),
      slice: bestScore('slice'),
      dash: bestScore('dash'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, lbTick]
  )
  const lb = useMemo(() => loadLB(lbTab), [lbTab, lbTick, view])

  // resolve the selected skin definition from a group
  const skinOf = (g) => {
    const group = SKIN_GROUPS.find((x) => x.id === g)
    return group.skins.find((x) => x.id === sel[g]) || group.skins[0]
  }
  const chickSkin = skinOf('chick')
  const stackSkin = skinOf('stack')
  const dartSkin = skinOf('dart')

  const gameProps = {
    player: player || undefined,
    onExit: () => {
      setView('hub')
      setLbTick((t) => t + 1)
    },
    onScore: () => setLbTick((t) => t + 1),
    walletMode: wallet?.mode,
  }

  // ---------------- game views ----------------
  if (view === 'chick') {
    return (
      <>
        <NimChick skin={chickSkin} {...gameProps} requestVerify={(id) => verifyScore('chick', id)} requestCup={(score) => cupSubmit('chick', score)} />
        {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
      </>
    )
  }
  if (view === 'stack') {
    return (
      <>
        <NimStack skin={stackSkin} {...gameProps} requestVerify={(id) => verifyScore('stack', id)} requestCup={(score) => cupSubmit('stack', score)} />
        {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
      </>
    )
  }
  if (view === 'bull') {
    return (
      <>
        <NimBullseye skin={dartSkin} {...gameProps} requestVerify={(id) => verifyScore('bull', id)} requestCup={(score) => cupSubmit('bull', score)} />
        {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
      </>
    )
  }
  if (view === 'rush') {
    return (
      <>
        <NimRush skin={chickSkin} {...gameProps} requestVerify={(id) => verifyScore('rush', id)} requestCup={(score) => cupSubmit('rush', score)} />
        {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
      </>
    )
  }
  if (view === 'swat') {
    return (
      <>
        <NimSwat {...gameProps} requestVerify={(id) => verifyScore('swat', id)} requestCup={(score) => cupSubmit('swat', score)} />
        {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
      </>
    )
  }
  if (view === 'slice') {
    return (
      <>
        <NimSlice skin={chickSkin} {...gameProps} requestVerify={(id) => verifyScore('slice', id)} requestCup={(score) => cupSubmit('slice', score)} />
        {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
      </>
    )
  }
  if (view === 'dash') {
    return (
      <>
        <NimDash skin={chickSkin} {...gameProps} requestVerify={(id) => verifyScore('dash', id)} requestCup={(score) => cupSubmit('dash', score)} />
        {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
      </>
    )
  }

  // ---------------- hub ----------------
  return (
    <div className="app">
      <div className="masthead">
        <Logo />
        <div className="masthead-text">
          <div className="wordmark">
            Nim<span>House</span>
          </div>
          <div className="sub">Skill games inside Nimiq Pay · Cycle II</div>
        </div>
        <button
          className="menu-btn"
          onClick={() => {
            setDraftName(claim?.name || player)
            setMenuOpen(true)
          }}
          aria-label="Open menu"
        >
          ☰
        </button>
      </div>

      <div className="card" style={{ padding: '10px 14px' }}>
        <div className="fair-strip">
          <span className="pill">100% skill-based</span>
          <span className="pill">Free to play</span>
          <span className="pill">No gambling</span>
          <span className="pill">Skins are cosmetic only</span>
        </div>
      </div>

      <div className="card">
        <h3>Play</h3>
        <div className="games-list">
          {GAMES.map((g) => (
            <div className="game-card" key={g.id}>
              <GameThumb
                kind={g.id}
                skin={g.id === 'chick' || g.id === 'rush' || g.id === 'slice' || g.id === 'dash' ? chickSkin : g.id === 'stack' ? stackSkin : undefined}
                dartSkin={dartSkin}
              />
              <div className="game-info">
                <div className="name">{g.name}</div>
                <div className="blurb">{g.blurb}</div>
                <div className="game-foot">
                 <span className="best-chip">
                    best <b>{bests[g.id]}</b>
                  </span>
                  <button className="btn primary small" onClick={() => setView(g.id)}>
                    Play
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <CupCard tick={lbTick} />

      <div className="card">
        <h3>NIM shop — cosmetics only</h3>
        {SKIN_GROUPS.map((group) => (
          <div key={group.id}>
            <div className="skin-group-label">{group.label}</div>
            {group.skins.map((skin) => {
              const isOwned = owned[group.id]?.includes(skin.id)
              const isSelected = sel[group.id] === skin.id
              const isBusy = busy === group.id + ':' + skin.id
              return (
                <div className="skin-row" key={skin.id}>
                  <SkinThumb group={group.id} skin={skin} />
                  <div className="skin-name">
                    {skin.name}
                    <small>cosmetic only · no gameplay effect</small>
                  </div>
                  {isSelected ? (
                    <span className="badge verified">EQUIPPED</span>
                  ) : isOwned ? (
                    <button className="btn small ghost" onClick={() => selectSkin(group.id, skin.id)}>
                      Equip
                    </button>
                  ) : (
                    <button
                      className="btn small gold"
                      disabled={isBusy || busy !== null}
                      onClick={() => buySkin(group.id, skin)}
                    >
                      {isBusy ? 'Sending…' : skin.price === 0 ? 'Free' : fmtNim(skin.price)}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        <p className="shop-note">
          Every purchase is a real NIM payment through Nimiq Pay, with a note attached on-chain.
          Replace nothing, win nothing — cosmetics never affect gameplay.
        </p>
        {lastTx && <div className="tx-line">{lastTx}</div>}
      </div>

      <div className="card">
        <h3>Cheer the house · tip in NIM</h3>
        <input
          className="cheer-msg"
          placeholder="Add a message (attached to the payment)"
          value={cheerMsg}
          maxLength={60}
          onChange={(e) => setCheerMsg(e.target.value)}
        />
        <div className="cheer-amounts">
          {[0.01, 0.05, 0.1].map((a) => (
            <button
              key={a}
              className="btn gold small"
              disabled={!connected || busy !== null}
              onClick={() => cheer(a)}
            >
              {busy === 'cheer' + a ? 'Sending…' : fmtNim(a * LUNA_PER_NIM)}
            </button>
          ))}
        </div>
        <div className="cheer-note">
          Cheers are NIM payments with your message attached on-chain, sent to the NimHouse community
          address{wallet?.mode === 'demo' ? ' (simulated in demo mode)' : ''}. It is a tip, not an
          entry fee — nobody pays to play, ever.
        </div>
        <CheerBoard tick={cheerTick} />
      </div>

      <div className="card">
        <h3>
          Leaderboard{' '}
          <span style={{ letterSpacing: 0, textTransform: 'none', fontWeight: 400 }}>(this device)</span>
        </h3>
        <div className="lb-tabs">
          {GAMES.map((g) => (
            <button key={g.id} className={`lb-tab ${lbTab === g.id ? 'on' : ''}`} onClick={() => setLbTab(g.id)}>
              {g.lbLabel}
            </button>
          ))}
        </div>
        {lb.length === 0 ? (
          <div className="lb-empty">No runs yet — be the first on the board.</div>
        ) : (
          lb.map((e, i) => (
            <div className="lb-row" key={e.id}>
              <div className="lb-rank">{i + 1}</div>
              <div className="lb-name">
                {e.name} {e.verified && <span className="badge verified">✓</span>}
              </div>
              <div className="lb-score">{e.score}</div>
            </div>
          ))
        )}
      </div>

      <div className="footer">MADE BY SASAM</div>

      {menuOpen && (
        <MenuPanel
          wallet={wallet}
          connected={connected}
          connecting={connecting}
          connectErr={connectErr}
          chain={chain}
          accounts={accounts}
          bests={bests}
          cupHistory={cupHistory}
          claim={claim}
          claimBusy={claimBusy}
          claimEditing={claimEditing}
          draftName={draftName}
          onDraftName={setDraftName}
          onClaim={submitClaim}
          onClaimEdit={() => {
            setDraftName(claim?.name || player)
            setClaimEditing(true)
          }}
          onClaimCancel={() => setClaimEditing(false)}
          onConnect={connect}
          onDisconnect={disconnect}
          onRefreshChain={refreshChain}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

