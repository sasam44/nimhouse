import { useEffect, useRef, useState } from 'react'
import { drawDart, drawSun, drawCloud, rr } from '../sketch'
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
const DART_SCALE = 1.15
const TIP_LEN = 24 * DART_SCALE // tip offset inside drawDart local coords

const RINGS = [
  { r: 118, pts: 1, c: '#2f3542' },
  { r: 96, pts: 3, c: '#ef476f' },
  { r: 74, pts: 5, c: '#06d6a0' },
  { r: 52, pts: 7, c: '#ef476f' },
  { r: 30, pts: 10, c: '#06d6a0' },
  { r: 16, pts: 25, c: '#f1faee' },
  { r: 8, pts: 50, c: '#ffd60a' },
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
        fromY: H + 60,
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
          const basePts = ringPts(x, y)
          const perfect = st.fly.perfect
          const pts = perfect ? basePts * 2 : basePts
          st.thrown.push({ x, y, pts, perfect })
          st.total += pts
          st.darts -= 1
          st.float = { x, y, pts, perfect, t: 0 }
          st.fly = null
          if (perfect && basePts > 0) sfx.win()
          else sfx.thud()
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
      // soft drop shadow
      const sh = ctx.createRadialGradient(CX, CY + 14, 30, CX, CY + 14, R + 40)
      sh.addColorStop(0, 'rgba(20,30,50,0.4)')
      sh.addColorStop(1, 'rgba(20,30,50,0)')
      ctx.fillStyle = sh
      ctx.beginPath()
      ctx.ellipse(CX, CY + 16, R + 34, R + 26, 0, 0, Math.PI * 2)
      ctx.fill()

      // wooden frame
      const wood = ctx.createLinearGradient(CX - R, CY - R, CX + R, CY + R)
      wood.addColorStop(0, '#b06a2c')
      wood.addColorStop(0.5, '#8d5524')
      wood.addColorStop(1, '#6e3f16')
      ctx.fillStyle = wood
      ctx.beginPath()
      ctx.arc(CX, CY, R + 11, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(50,25,5,0.6)'
      ctx.lineWidth = 2.5
      ctx.stroke()

      // rings
      for (const r of RINGS) {
        ctx.fillStyle = r.c
        ctx.beginPath()
        ctx.arc(CX, CY, r.r, 0, Math.PI * 2)
        ctx.fill()
      }
      // gold bullseye rim
      ctx.strokeStyle = '#e8940a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(CX, CY, 8, 0, Math.PI * 2)
      ctx.stroke()

      // spokes
      ctx.strokeStyle = 'rgba(14,22,38,0.4)'
      ctx.lineWidth = 1.6
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4
        ctx.beginPath()
        ctx.moveTo(CX + Math.cos(a) * 9, CY + Math.sin(a) * 9)
        ctx.lineTo(CX + Math.cos(a) * (R - 1), CY + Math.sin(a) * (R - 1))
        ctx.stroke()
      }

      // 3D dome: highlight top-left, shade bottom-right
      const hi = ctx.createRadialGradient(CX - 45, CY - 55, 8, CX - 20, CY - 20, R + 30)
      hi.addColorStop(0, 'rgba(255,255,255,0.30)')
      hi.addColorStop(0.5, 'rgba(255,255,255,0.06)')
      hi.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = hi
      ctx.beginPath()
      ctx.arc(CX, CY, R, 0, Math.PI * 2)
      ctx.fill()
      const lo = ctx.createRadialGradient(CX + 50, CY + 60, 10, CX + 20, CY + 30, R + 20)
      lo.addColorStop(0, 'rgba(0,0,20,0.28)')
      lo.addColorStop(1, 'rgba(0,0,20,0)')
      ctx.fillStyle = lo
      ctx.beginPath()
      ctx.arc(CX, CY, R, 0, Math.PI * 2)
      ctx.fill()
    }

    /** draw a dart so its TIP is exactly at (tx, ty), pointing up */
    function drawPinnedDart(ctx, tx, ty, scale = DART_SCALE) {
      // pin shadow
      ctx.fillStyle = 'rgba(0,0,20,0.35)'
      ctx.beginPath()
      ctx.ellipse(tx + 2, ty + 3, 4 * scale, 2 * scale, 0, 0, Math.PI * 2)
      ctx.fill()
      drawDart(ctx, tx, ty + TIP_LEN, 0, skinRef.current, scale)
    }

    function draw(ctx, st) {
      // cheerful sky
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#8ee0ff')
      bg.addColorStop(0.6, '#c9f3ff')
      bg.addColorStop(1, '#fff6d8')
      ctx.fillStyle = bg
      ctx.fillRect(-12, -12, W + 24, H + 24)
      drawSun(ctx, 322, 58, 20)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      drawCloud(ctx, 60 + Math.sin(st.t * 0.5) * 8, 70, 0.7)
      drawCloud(ctx, 300 + Math.sin(st.t * 0.4 + 2) * 8, 470, 0.6)

      drawBoard(ctx)

      // pinned darts — TIP exactly at the scored point
      for (const d of st.thrown) drawPinnedDart(ctx, d.x, d.y)

      // flying dart
      if (st.fly) {
        const t = Math.min(st.fly.t, 1)
        const e = t * t
        const x = st.fly.fromX + (st.fly.toX - st.fly.fromX) * e
        const y = st.fly.fromY + (st.fly.toY - st.fly.fromY) * e
        drawDart(ctx, x, y + TIP_LEN * e, 0, skinRef.current, 0.7 + 0.45 * e)
      }

      // aim crosshair
      if (st.phase === 'playing' && !st.fly) {
        const a = aimPos(st.t)
        ctx.strokeStyle = st.charging ? 'rgba(255,159,28,0.95)' : 'rgba(255,255,255,0.95)'
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.arc(a.x, a.y, 11, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(a.x - 17, a.y)
        ctx.lineTo(a.x - 6, a.y)
        ctx.moveTo(a.x + 6, a.y)
        ctx.lineTo(a.x + 17, a.y)
        ctx.moveTo(a.x, a.y - 17)
        ctx.lineTo(a.x, a.y - 6)
        ctx.moveTo(a.x, a.y + 6)
        ctx.lineTo(a.x, a.y + 17)
        ctx.stroke()
      }

      // floating points (bouncy)
      if (st.float) {
        const f = st.float
        const alpha = Math.max(0, 1 - f.t / 70)
        const size = f.t < 10 ? 18 + f.t * 1.6 : f.perfect ? 30 : 34
        ctx.globalAlpha = alpha
        ctx.font = `800 ${size}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.lineWidth = 5
        ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        const label = f.pts === 0 ? 'MISS' : f.perfect ? `PERFECT +${f.pts}` : `+${f.pts}`
        const ly = f.y - 26 - f.t * 0.6
        ctx.strokeText(label, f.x, ly)
        ctx.fillStyle = f.perfect ? '#ffd60a' : f.pts === 0 ? '#ff5d5d' : '#2b6cb0'
        ctx.fillText(label, f.x, ly)
        ctx.globalAlpha = 1
      }

      // ---------- HUD ----------
      ctx.font = '800 30px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.lineWidth = 6
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.strokeText(String(st.total), 16, 44)
      ctx.fillStyle = '#2b6cb0'
      ctx.fillText(String(st.total), 16, 44)
      ctx.font = '700 10px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(43,70,110,0.7)'
      ctx.fillText('ROUND TOTAL', 17, 58)

      // darts left (mini darts)
      for (let i = 0; i < DARTS_PER_ROUND; i++) {
        ctx.globalAlpha = i < st.darts ? 1 : 0.25
        drawDart(ctx, W - 26 - i * 24, 40, Math.PI, skinRef.current, 0.6)
      }
      ctx.globalAlpha = 1

      // power meter (rounded, sweet band glows)
      const mx = W - 32
      const mt = 110
      const mh = 340
      const mw = 16
      ctx.fillStyle = 'rgba(20,35,60,0.55)'
      rr(ctx, mx, mt, mw, mh, 8)
      ctx.fill()
      // sweet band
      const yTop = mt + mh * (1 - (SWEET + 6) / 100)
      const yBot = mt + mh * (1 - (SWEET - 6) / 100)
      ctx.fillStyle = 'rgba(34,224,127,0.55)'
      rr(ctx, mx, yTop, mw, yBot - yTop, 3)
      ctx.fill()
      // sweet line
      const ys = mt + mh * (1 - SWEET / 100)
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(mx - 3, ys)
      ctx.lineTo(mx + mw + 3, ys)
      ctx.stroke()
      // fill
      if (st.charging) {
        const fh = (st.power / 100) * (mh - 4)
        const inSweet = st.power >= SWEET - 6 && st.power <= SWEET + 6
        ctx.fillStyle = inSweet ? '#22e07f' : '#ffb703'
        rr(ctx, mx + 2, mt + 2 + (mh - 4) - fh, mw - 4, fh, 6)
        ctx.fill()
      }
      ctx.font = '800 10px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(43,70,110,0.8)'
      ctx.textAlign = 'center'
      ctx.fillText('POWER', mx + mw / 2, mt + mh + 18)
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
                The dart lands exactly where your crosshair is. Ride the sway, release on your ring.
                Release in the <b style={{ color: 'var(--green)' }}>green band</b> for a PERFECT throw
                (2× points). Five darts per round.
              </p>
              <p className="panel-hint">HOLD to charge · RELEASE on your ring</p>
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
