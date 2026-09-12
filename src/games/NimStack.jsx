import { useEffect, useRef, useState } from 'react'
import { drawBlock3D, drawSun, drawCloud, rr } from '../sketch'
import { sfx } from '../sound'
import { bestScore, submitScore } from '../leaderboard'
import { getDeviceId } from '../wallet'
import ScoreOverlay from '../components/ScoreOverlay'

const W = 360
const H = 600
const BH = 26
const BASE_W = 170
const TOPY = 430 // screen y of the tower's top block (fixed)
const DROPY = 108 // screen y of the floating block

const QUOTES = [
  'The tower chose its own ending.',
  'Almost perfect alignment. Almost.',
  'Gravity: undefeated.',
  'That overhang was a bold choice.',
  'The blocks remember your hands.',
]

export default function NimStack({ skin, player, onExit, onScore, requestVerify, walletMode, requestCup }) {
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
  const [best, setBest] = useState(() => bestScore('stack'))
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
      phase: 'ready', // ready | sliding | falling | over
      t: 0,
      blocks: [{ x: (W - BASE_W) / 2, w: BASE_W }],
      cur: null, // floating block {x, w, dir}
      drop: null, // falling block {x, w, y, vy}
      falling: [], // debris {x, y, w, vy, rot, vr}
      particles: [],
      score: 0,
      shake: 0,
      squash: 0,
    }
    st.camY = 0

    const hueOf = () => skinRef.current?.hue ?? 158

    function topScreenY(i, n) {
      return TOPY + (n - 1 - i) * BH
    }

    function spawn() {
      const top = st.blocks[st.blocks.length - 1]
      const w = top.w
      const fromLeft = st.blocks.length % 2 === 1
      st.cur = { x: fromLeft ? -w : W, w, dir: fromLeft ? 1 : -1 }
      st.phase = 'sliding'
    }

    function start() {
      spawn()
      setPhase('sliding')
    }

    function puff(x, y) {
      for (let i = 0; i < 7; i++) {
        st.particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 4,
          vy: -Math.random() * 2.4,
          life: 18 + Math.random() * 8,
        })
      }
    }

    function finish() {
      st.phase = 'over'
      setPhase('over')
      const prevBest = bestScore('stack')
      const isBest = st.score > prevBest
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
      const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      getDeviceId().then((device) => {
        const res = submitScore('stack', {
          id,
          name: playerRef.current || 'Anonymous',
          score: st.score,
          device,
          verified: false,
          ts: Date.now(),
        })
        setEntry({ id, rank: res.rank, isBest })
        setBest(Math.max(prevBest, st.score))
        onScoreRef.current?.('stack', st.score)
      })
    }

    function drop() {
      if (st.phase === 'ready') {
        start()
        return
      }
      if (st.phase !== 'sliding' || !st.cur) return
      st.drop = { x: st.cur.x, w: st.cur.w, y: DROPY, vy: 0 }
      st.cur = null
      st.phase = 'falling'
      sfx.pop()
    }

    function land() {
      const d = st.drop
      st.drop = null
      const n = st.blocks.length
      const top = st.blocks[n - 1]
      const overlapStart = Math.max(d.x, top.x)
      const overlapEnd = Math.min(d.x + d.w, top.x + top.w)
      const overlap = overlapEnd - overlapStart

      if (overlap <= 14) {
        st.falling.push({ x: d.x, y: TOPY, w: d.w, vy: 0, rot: 0, vr: d.x < top.x ? -0.06 : 0.06 })
        st.shake = 12
        sfx.hit()
        finish()
        return
      }

      st.blocks.push({ x: overlapStart, w: overlap })
      st.score = st.blocks.length - 1
      setScore(st.score)
      st.squash = 1
      puff(overlapStart, TOPY)
      puff(overlapStart + overlap, TOPY)
      sfx.drop()

      if (d.x < top.x) {
        st.falling.push({ x: d.x, y: TOPY, w: top.x - d.x, vy: 0, rot: 0, vr: -0.05 })
      } else if (d.x + d.w > top.x + top.w) {
        st.falling.push({ x: top.x + top.w, y: TOPY, w: d.x + d.w - (top.x + top.w), vy: 0, rot: 0, vr: 0.05 })
      }
      spawn()
    }

    controls.current.replay = () => {
      st.phase = 'ready'
      st.t = 0
      st.blocks = [{ x: (W - BASE_W) / 2, w: BASE_W }]
      st.cur = null
      st.drop = null
      st.falling = []
      st.particles = []
      st.score = 0
      st.shake = 0
      st.squash = 0
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

      if (st.phase === 'sliding' && st.cur) {
        const speed = 2.2 + Math.min(st.blocks.length * 0.06, 2.4)
        st.cur.x += st.cur.dir * speed * dt
        if (st.cur.dir > 0 && st.cur.x >= W - 4 - st.cur.w) st.cur.dir = -1
        if (st.cur.dir < 0 && st.cur.x <= 4) st.cur.dir = 1
        st.cur.x = Math.max(4, Math.min(W - 4 - st.cur.w, st.cur.x))
      }

      if (st.phase === 'falling' && st.drop) {
        st.drop.vy += 0.85 * dt
        st.drop.y += st.drop.vy * dt
        if (st.drop.y >= TOPY) {
          st.drop.y = TOPY
          land()
        }
      }

      for (const f of st.falling) {
        f.vy += 0.7 * dt
        f.y += f.vy * dt
        f.rot += f.vr * dt
      }
      st.falling = st.falling.filter((f) => f.y < H + 160)

      for (const p of st.particles) {
        p.vy += 0.28 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
      }
      st.particles = st.particles.filter((p) => p.life > 0)

      if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 0.8)
      st.squash *= Math.pow(0.86, dt)
      if (st.squash < 0.02) st.squash = 0

      draw(ctx, st)
    }

    function draw(ctx, st) {
      ctx.save()
      if (st.shake > 0) {
        ctx.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake)
      }

      // cheerful day sky
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#8ee0ff')
      sky.addColorStop(0.6, '#c9f3ff')
      sky.addColorStop(1, '#eafff2')
      ctx.fillStyle = sky
      ctx.fillRect(-12, -12, W + 24, H + 24)

      drawSun(ctx, 52, 66, 22)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      drawCloud(ctx, 250 + Math.sin(st.t * 0.5) * 8, 90, 0.9)
      drawCloud(ctx, 90 + Math.sin(st.t * 0.4 + 2) * 10, 180, 0.65)

      // tower geometry (top block stays at TOPY; base scrolls down)
      const n = st.blocks.length
      const baseY = topScreenY(0, n)
      const groundY = baseY + BH + 20

      // ground (attached to the pedestal so it scrolls away)
      ctx.fillStyle = '#7ed957'
      ctx.fillRect(-12, groundY, W + 24, 12)
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(-12, groundY, W + 24, 3)
      ctx.fillStyle = '#e0a55e'
      ctx.fillRect(-12, groundY + 12, W + 24, H - groundY + 400)

      if (baseY < H + 80) {
        // pedestal (wooden platform under the base block)
        const px = W / 2 - 130
        const pw = 260
        ctx.fillStyle = '#a8672f'
        rr(ctx, px, baseY + BH, pw, 20, 6)
        ctx.fill()
        ctx.fillStyle = '#c9853f'
        rr(ctx, px, baseY + BH, pw, 8, 4)
        ctx.fill()
        ctx.strokeStyle = 'rgba(80,40,10,0.4)'
        ctx.lineWidth = 2
        rr(ctx, px, baseY + BH, pw, 20, 6)
        ctx.stroke()
      }

      // tower blocks (cull off-screen)
      const hue = hueOf()
      for (let i = 0; i < n; i++) {
        const b = st.blocks[i]
        const by = topScreenY(i, n)
        if (by > H + 60) continue
        const isTop = i === n - 1
        drawBlock3D(ctx, b.x, by, b.w, hue + i * 4, BH, isTop ? st.squash : 0)
      }

      // drop guide (where the block will land)
      if (st.phase === 'sliding' && st.cur) {
        const cx = st.cur.x + st.cur.w / 2
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 8])
        ctx.beginPath()
        ctx.moveTo(cx, DROPY + BH + 4)
        ctx.lineTo(cx, TOPY - 4)
        ctx.stroke()
        ctx.setLineDash([])
        // shadow on the tower top
        const top = st.blocks[n - 1]
        const lo = Math.max(st.cur.x, top.x)
        const hi = Math.min(st.cur.x + st.cur.w, top.x + top.w)
        ctx.fillStyle = 'rgba(0,0,0,0.22)'
        if (hi > lo) ctx.fillRect(lo, TOPY, hi - lo, 4)
      }

      // floating block
      if (st.cur) drawBlock3D(ctx, st.cur.x, DROPY, st.cur.w, hue + n * 4 + 8)
      // falling block
      if (st.drop) drawBlock3D(ctx, st.drop.x, st.drop.y, st.drop.w, hue + n * 4 + 8)

      // debris
      for (const f of st.falling) {
        ctx.save()
        ctx.translate(f.x + f.w / 2, f.y + BH / 2)
        ctx.rotate(f.rot)
        ctx.globalAlpha = 0.92
        ctx.fillStyle = `hsl(${hue}, 50%, 46%)`
        ctx.fillRect(-f.w / 2, -BH / 2, f.w, BH)
        ctx.restore()
      }

      // puff particles
      for (const p of st.particles) {
        ctx.globalAlpha = Math.max(0, p.life / 24)
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      ctx.restore()

      // HUD
      ctx.font = '800 34px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.lineWidth = 6
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.strokeText(String(st.score), 16, 48)
      ctx.fillStyle = '#2b6cb0'
      ctx.fillText(String(st.score), 16, 48)
    }

    // ---------------- input ----------------
    const stage = stageRef.current
    const onPointer = (e) => {
      if (e.target.closest && e.target.closest('button')) return
      e.preventDefault()
      drop()
    }
    stage.addEventListener('pointerdown', onPointer)
    const onKey = (e) => {
      if ((e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat) {
        e.preventDefault()
        drop()
      }
    }
    window.addEventListener('keydown', onKey)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      stage.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="gameview" ref={stageRef}>
      <div className="gamebar">
        <button className="btn icon ghost" onClick={onExit} aria-label="Back">
          ←
        </button>
        <div className="gamebar-title">NimStack</div>
        <div className="gamebar-best">best {best}</div>
      </div>
      <div className="stage">
        <canvas ref={canvasRef} className="game" />
        {phase === 'ready' && (
          <div className="overlay">
            <div className="panel">
              <h2>NimStack</h2>
              <p className="panel-sub">
                The block floats above and falls when you tap. Time the drop — every overhang gets
                sliced off.
              </p>
              <p className="panel-hint">TAP or SPACE to drop</p>
            </div>
          </div>
        )}
        {phase === 'over' && (
          <div className="overlay">
            <ScoreOverlay
              gameLabel="NimStack"
              score={score}
              best={best}
              isBest={entry?.isBest}
              quote={quote}
              rankLine={entry && entry.rank ? `#${entry.rank} on device board` : ''}
              onReplay={() => controls.current.replay()}
              onExit={onExit}
              requestVerify={requestVerify}
              entryId={entry?.id}
              onCup={requestCup}
              walletMode={walletMode}
            />
          </div>
        )}
      </div>
    </div>
  )
}
