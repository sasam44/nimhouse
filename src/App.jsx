import { useEffect, useMemo, useRef, useState } from 'react'
import { getWallet, CHEER_ADDRESS, LUNA_PER_NIM, fmtNim, shortHash } from './wallet'
import { SKIN_GROUPS } from './skins'
import {
  drawChicken,
  drawDart,
  drawStackPreview,
  drawBoardPreview,
  drawRushPreview,
  drawSwatPreview,
  drawSlicePreview,
  drawHopPreview,
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
import NimHop from './games/NimHop'

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
    id: 'hop',
    name: 'NimHop',
    blurb: 'Steer your bouncing chick up an endless tower of platforms. Hold, wrap, climb.',
    how: 'hold arrows / drag',
    lbLabel: 'Hop',
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
    else if (kind === 'hop') drawHopPreview(ctx, 76, 76, skin)
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
  hop: 'NimHop',
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
  return (
    <div className="card cup-card">
      <h3>🏆 NimHouse Cup — daily</h3>
      <p className="cup-pool">
        {pool?.perGameDailyNim ?? 100} NIM per game · top 3 take{' '}
        {pool?.splitPct?.join(' / ') ?? '50 / 30 / 20'}% · staked daily by the{' '}
        <b>NimHouse wallet</b>
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
        (signs with your Nimiq wallet). One entry per device per game per day — best score
        counts. Pool, entries &amp; payouts are public in the open-source repo.
      </p>
    </div>
  )
}

export default function App() {
  const [wallet, setWallet] = useState(null)
  const [view, setView] = useState('hub')

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
    const day = new Date().toISOString().slice(0, 10)
    try {
      const device = await getDeviceId()
      const message = `NimHouse Cup | game=${game} | day=${day} | score=${Math.floor(score)} | device=${device}`
      const res = await wallet.nimiq.sign(message)
      if (res && res.error) return { ok: false, error: res.error.message || 'Signing rejected' }
      const body = {
        game,
        day,
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
      hop: bestScore('hop'),
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
  if (view === 'hop') {
    return (
      <>
        <NimHop skin={chickSkin} {...gameProps} requestVerify={(id) => verifyScore('hop', id)} requestCup={(score) => cupSubmit('hop', score)} />
        {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
      </>
    )
  }

  // ---------------- hub ----------------
  return (
    <div className="app">
      <div className="masthead">
        <Logo />
        <div>
          <div className="wordmark">
            Nim<span>House</span>
          </div>
          <div className="sub">Skill games inside Nimiq Pay · Cycle II</div>
        </div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Nimiq Pay wallet</h3>
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
                Running outside Nimiq Pay, so wallet actions are <b>simulated</b> — everything stays
                testable. Open the app inside Nimiq Pay for real NIM payments.
              </div>
            )}
            <button className="btn primary block" onClick={connect} disabled={connecting}>
              {connecting ? (
                <>
                  <span className="spin" /> Connecting…
                </>
              ) : (
                'Connect wallet'
              )}
            </button>
            {connectErr && <div className="wallet-meta" style={{ color: 'var(--red)' }}>{connectErr}</div>}
          </div>
        ) : (
          <div>
            <div className="wallet-row">
              <span className="wallet-dot on" />
              <div className="wallet-meta" style={{ margin: 0 }}>
                Connected{chain ? ` · block ${(chain.block || 0).toLocaleString()}` : ''}
              </div>
            </div>
            <div className="wallet-addr">{shortAddr(accounts?.[0])}</div>
            <div className="wallet-meta">
              Nimiq consensus: {chain ? (chain.consensus ? 'established ✓' : 'not yet…') : 'checking…'}
            </div>
            <div className="wallet-actions">
              <button className="btn small ghost" onClick={refreshChain}>
                ↻ Refresh status
              </button>
              <button className="btn small ghost" onClick={disconnect}>
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Your gamertag</h3>
        <input
          className="name-input"
          value={player}
          placeholder="e.g. ChickRider"
          maxLength={16}
          onChange={(e) => {
            setPlayer(e.target.value)
            localStorage.setItem('nimhouse.player', e.target.value)
          }}
        />
      </div>

      <div className="card">
        <h3>Play</h3>
        <div className="games-list">
          {GAMES.map((g) => (
            <div className="game-card" key={g.id}>
              <GameThumb
                kind={g.id}
                skin={g.id === 'chick' || g.id === 'rush' || g.id === 'slice' || g.id === 'hop' ? chickSkin : g.id === 'stack' ? stackSkin : undefined}
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

      <div className="footer">
        <b>NimHouse</b> · built for the Nimiq Mini Apps Competition — Cycle II
        <br />
        Nimiq Pay Mini Apps Framework · NIM payments · wallet-verified scores
        <br />
        MIT License · open source · no entry fees · no gambling
      </div>

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

