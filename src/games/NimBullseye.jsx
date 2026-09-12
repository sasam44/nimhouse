import { useEffect, useRef, useState } from 'react'
import { drawDart } from '../sketch'
import { sfx } from '../sound'
import { bestScore, submitScore } from '../leaderboard'
import { getDeviceId } from '../wallet'
import ScoreOverlay from '../components/ScoreOverlay'

const W = 360
const H = 600
const CX = 180
const CY = 232
const R = 118
const DARTS_PER_ROUND = 5
const SWEET = 72 // ideal power

const RINGS = [
  { r: 118, pts: 1, c: '#33415c' },
  { r: 96, pts: 3, c: '#e63946' },
  { r: 74, pts: 5, c: '#17c964' },
  { r: 52, pts: 7, c: '#e63946' },
  { r: 30, pts: 10, c: '#17c964' },
  { r: 16, pts: 25, c: '#f5f7fa' },
  { r: 8, pts: 50, c: '#ffd23f' },
]

const QUOTES = [
  'The board remembers your throws.',
  'Sharpshooter material, eventually.',
  'Bullseye dreams, for another round.',
  'Your arm had opinions today.',
  'The sway won that round.',
]

function ringPts(x, y) {
  const d = Math.hypot(x - CX, y - CY)
  for (const r of RINGS) if (d <= r.r) return r.pts
  return 0
}

function aimPos(t) {
  return { x: CX + Math.sin(t * 1.35) * 62, y: CY + Math.sin(t * 2.1 + 0.8) * 34 }
}

export default function NimBullseye({ skin, player, onExit, onScore, requestVerify, walletMode }) {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const controls = useRef({ replay: () => {} })
  const skinRef = useRef(skin)
  skinRef.current = skin
  const playerRef = useRef(player)
  playerRef.current = player
  const onScoreRef = useRef(onScore)
  onScoreRef.current = onScore

  const [phase, setPhase] = useState('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => bestScore('bull'))
  const [quote, setQuote] = useState('')
  const [entry, setEntry] = useState(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const st = {
      phase: 'ready',
      t: 0,
      darts: DARTS_PER_ROUND,
      thrown: [],
      charging: false,
      chargeStart: 0,
      power: 0,
      fly: null,
      total: 0,
      float: null,
    }

    function start() {
      st.phase = 'playing'
      setPhase('playing')
    }

    function finish() {
      st.phase = 'over'
      setPhase('over')
      const prevBest = bestScore('bull')
      const isBest = st.total > prevBest
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
      const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      getDeviceId().then((device) => {
        const res = submitScore('bull', {
          id,
          name: playerRef.current || 'Anonymous',
          score: st.total,
          device,
          verified: false,
          ts: Date.now(),
        })
        setEntry({ id, rank: res.rank, isBest })
        setBest(Math.max(prevBest, st.total))
        onScoreRef.current?.('bull', st.total)
      })
    }

    function press() {
      if (st.phase === 'ready') {
        start()
        return
      }
      if (st.phase === 'playing' && !st.fly) {
        st.charging = true
        st.chargeStart = st.t
      }
    }

    function release() {
      if (st.phase !== 'playing' || !st.charging || st.fly) return
      st.charging = false
      const p = 100 * (0.5 - 0.5 * Math.cos((st.t - st.chargeStart) * 5.2))
      st.power = p
      const a = aimPos(st.t)
      const err = p - SWEET
      const drift = Math.abs(err) * 1.15
      let dx = a.x - CX
      let dy = a.y - CY
      const len = Math.hypot(dx, dy) || 1
      dx /= len
      dy /= len
      st.fly = {
        t: 0,
        fromX: CX,
        fromY: H + 50,
        toX: a.x + dx * drift,
        toY: a.y + dy * drift,
      }
      sfx.pop()
    }

    controls.current.replay = () => {
      st.phase = 'ready'
      st.t = 0
      st.darts = DARTS_PER_ROUND
      st.thrown = []
      st.charging = false
      st.power = 0
      st.fly = null
      st.total = 0
      st.float = null
      setScore(0)
      setEntry(null)
      setQuote('')
      setPhase('ready')
    }

    // ---------------- update + draw ----------------
    let raf = 0
    let last = performance.now()

    function frame(now) {
      raf = requestAnimationFrame(frame)
      let dt = (now - last) / (1000 / 60)
      last = now
      if (dt > 3) dt = 3
      st.t += dt / 60

      if (st.charging) {
        st.power = 100 * (0.5 - 0.5 * Math.cos((st.t - st.chargeStart) * 5.2))
      }

      if (st.fly) {
        st.fly.t += dt / 18
        if (st.fly.t >= 1) {
          const x = st.fly.toX
          const y = st.fly.toY
          const pts = ringPts(x, y)
          st.thrown.push({ x, y, pts })
          st.total += pts
          st.darts -= 1
          st.float = { x, y, pts, t: 0 }
          st.fly = null
          sfx.thud()
          setScore(st.total)
          if (st.darts <= 0) finish()
        }
      }

      if (st.float) {
        st.float.t += dt
        if (st.float.t > 70) st.float = null
      }

      draw(ctx, st)
    }

    function drawBoard(ctx) {
      // outer frame
      ctx.fillStyle = '#0e1626'
      ctx.beginPath()
      ctx.arc(CX, CY, R + 8, 0, Math.PI * 2)
      ctx.fill()
      for (const r of RINGS) {
        ctx.fillStyle = r.c
        ctx.beginPath()
        ctx.arc(CX, CY, r.r, 0, Math.PI * 2)
        ctx.fill()
      }
      // spokes
      ctx.strokeStyle = 'rgba(14,22,38,0.55)'
      ctx.lineWidth = 2
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4
        ctx.beginPath()
        ctx.moveTo(CX, CY)
        ctx.lineTo(CX + Math.cos(a) * R, CY + Math.sin(a) * R)
        ctx.stroke()
      }
    }

    function draw(ctx, st) {
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#10192b')
      bg.addColorStop(1, '#1a2947')
      ctx.fillStyle = bg
      ctx.fillRect(-12, -12, W + 24, H + 24)

      drawBoard(ctx)

      // pinned darts
      for (const d of st.thrown) drawDart(ctx, d.x, d.y, 0, skinRef.current, 1.1)

      // flying dart
      if (st.fly) {
        const t = Math.min(st.fly.t, 1)
        const e = t * t
        const x = st.fly.fromX + (st.fly.toX - st.fly.fromX) * e
        const y = st.fly.fromY + (st.fly.toY - st.fly.fromY) * e
        drawDart(ctx, x, y, 0, skinRef.current, 0.7 + 0.5 * e)
      }

      // aim crosshair
      if (st.phase === 'playing' && !st.fly) {
        const a = aimPos(st.t)
        ctx.strokeStyle = st.charging ? 'rgba(255,183,3,0.95)' : 'rgba(255,255,255,0.9)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(a.x, a.y, 11, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(a.x - 16, a.y)
        ctx.lineTo(a.x - 6, a.y)
        ctx.moveTo(a.x + 6, a.y)
        ctx.lineTo(a.x + 16, a.y)
        ctx.moveTo(a.x, a.y - 16)
        ctx.lineTo(a.x, a.y - 6)
        ctx.moveTo(a.x, a.y + 6)
        ctx.lineTo(a.x, a.y + 16)
        ctx.stroke()
      }

      // floating points
      if (st.float) {
        const f = st.float
        const alpha = Math.max(0, 1 - f.t / 70)
        ctx.globalAlpha = alpha
        ctx.font = '800 26px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = f.pts >= 25 ? '#ffd23f' : '#fff'
        ctx.fillText(f.pts === 0 ? 'MISS' : `+${f.pts}`, f.x, f.y - 24 - f.t * 0.5)
        ctx.globalAlpha = 1
      }

      // ---------- HUD ----------
      // total
      ctx.font = '800 30px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.lineWidth = 5
      ctx.strokeStyle = 'rgba(10,18,31,0.6)'
      ctx.strokeText(String(st.total), 16, 44)
      ctx.fillStyle = '#fff'
      ctx.fillText(String(st.total), 16, 44)
      ctx.font = '600 11px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(234,241,250,0.55)'
      ctx.fillText('ROUND TOTAL', 16, 60)

      // darts left
      for (let i = 0; i < DARTS_PER_ROUND; i++) {
        ctx.globalAlpha = i < st.darts ? 1 : 0.22
        drawDart(ctx, W - 24 - i * 22, 38, Math.PI, skinRef.current, 0.62)
      }
      ctx.globalAlpha = 1

      // power meter (right side)
      const mx = W - 30
      const mt = 120
      const mh = 330
      ctx.fillStyle = 'rgba(10,18,31,0.75)'
      ctx.fillRect(mx, mt, 14, mh)
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(mx, mt, 14, mh)
      // sweet band
      const yTop = mt + mh * (1 - (SWEET + 6) / 100)
      const yBot = mt + mh * (1 - (SWEET - 6) / 100)
      ctx.fillStyle = 'rgba(34,224,127,0.5)'
      ctx.fillRect(mx, yTop, 14, yBot - yTop)
      // fill
      if (st.charging) {
        const fh = (st.power / 100) * mh
        const inSweet = st.power >= SWEET - 6 && st.power <= SWEET + 6
        ctx.fillStyle = inSweet ? '#22e07f' : '#ffb703'
        ctx.fillRect(mx, mt + mh - fh, 14, fh)
      }
      ctx.font = '700 10px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(234,241,250,0.6)'
      ctx.textAlign = 'center'
      ctx.fillText('PWR', mx + 7, mt + mh + 16)
    }

    // ---------------- input ----------------
    const stage = stageRef.current
    const onPointerDown = (e) => {
      if (e.target.closest && e.target.closest('button')) return
      e.preventDefault()
      press()
    }
    const onPointerUp = () => release()
    stage.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    const onKeyDown = (e) => {
      if ((e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat) {
        e.preventDefault()
        press()
      }
    }
    const onKeyUp = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        release()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      stage.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  return (
    <div className="gameview" ref={stageRef}>
      <div className="gamebar">
        <button className="btn icon ghost" onClick={onExit} aria-label="Back">
          ←
        </button>
        <div className="gamebar-title">NimBullseye</div>
        <div className="gamebar-best">best {best}</div>
      </div>
      <div className="stage">
        <canvas ref={canvasRef} className="game" />
        {phase === 'ready' && (
          <div className="overlay">
            <div className="panel">
              <h2>NimBullseye</h2>
              <p className="panel-sub">
                The aim sways, the power oscillates. Hold to charge, release in the green band. Five
                darts per round — pure feel.
              </p>
              <p className="panel-hint">HOLD to charge · RELEASE to throw</p>
            </div>
          </div>
        )}
        {phase === 'over' && (
          <div className="overlay">
            <ScoreOverlay
              gameLabel="NimBullseye"
              score={score}
              best={best}
              isBest={entry?.isBest}
              quote={quote}
              rankLine={entry && entry.rank ? `#${entry.rank} on device board` : ''}
              onReplay={() => controls.current.replay()}
              onExit={onExit}
              requestVerify={requestVerify}
              entryId={entry?.id}
              walletMode={walletMode}
            />
          </div>
        )}
      </div>
    </div>
  )
}
