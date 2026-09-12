import { useEffect, useRef, useState } from 'react'
import { sfx } from '../sound'
import { bestScore, submitScore } from '../leaderboard'
import { getDeviceId } from '../wallet'
import ScoreOverlay from '../components/ScoreOverlay'

const W = 360
const H = 600
const BH = 26
const BASE_W = 170
const BASE_Y = H - 120

const QUOTES = [
  'The tower chose its own ending.',
  'Almost perfect alignment. Almost.',
  'Gravity: undefeated.',
  'That overhang was a bold choice.',
  'The blocks remember your hands.',
]

export default function NimStack({ skin, player, onExit, onScore, requestVerify, walletMode }) {
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
      phase: 'ready',
      t: 0,
      blocks: [{ x: (W - BASE_W) / 2, w: BASE_W, y: BASE_Y }],
      cur: null,
      falling: [],
      score: 0,
      shake: 0,
    }
    st.camY = 0

    function spawn() {
      const top = st.blocks[st.blocks.length - 1]
      const w = top.w
      const fromLeft = st.blocks.length % 2 === 1
      st.cur = { x: fromLeft ? -w : W, w, dir: fromLeft ? 1 : -1, y: top.y - BH }
    }

    function start() {
      st.phase = 'playing'
      spawn()
      setPhase('playing')
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
      if (st.phase !== 'playing' || !st.cur) return
      const top = st.blocks[st.blocks.length - 1]
      const c = st.cur
      const overlapStart = Math.max(c.x, top.x)
      const overlapEnd = Math.min(c.x + c.w, top.x + top.w)
      const overlap = overlapEnd - overlapStart

      if (overlap <= 14) {
        st.falling.push({ x: c.x, y: c.y, w: c.w, vy: 0, rot: 0, vr: c.dir * 0.06 })
        st.cur = null
        st.shake = 12
        sfx.hit()
        finish()
        return
      }

      st.blocks.push({ x: overlapStart, w: overlap, y: c.y })
      st.score = st.blocks.length - 1
      setScore(st.score)
      sfx.drop()

      if (c.x < top.x) {
        st.falling.push({ x: c.x, y: c.y, w: top.x - c.x, vy: 0, rot: 0, vr: -0.05 })
      } else if (c.x + c.w > top.x + top.w) {
        st.falling.push({ x: top.x + top.w, y: c.y, w: c.x + c.w - (top.x + top.w), vy: 0, rot: 0, vr: 0.05 })
      }
      st.cur = null
      spawn()
    }

    controls.current.replay = () => {
      st.phase = 'ready'
      st.t = 0
      st.blocks = [{ x: (W - BASE_W) / 2, w: BASE_W, y: BASE_Y }]
      st.cur = null
      st.falling = []
      st.score = 0
      st.shake = 0
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

      if (st.phase === 'playing' && st.cur) {
        const speed = 2.2 + Math.min(st.blocks.length * 0.06, 2.4)
        st.cur.x += st.cur.dir * speed * dt
        if (st.cur.dir > 0 && st.cur.x >= W - 4 - st.cur.w) st.cur.dir = -1
        if (st.cur.dir < 0 && st.cur.x <= 4) st.cur.dir = 1
        st.cur.x = Math.max(4, Math.min(W - 4 - st.cur.w, st.cur.x))
      }

      // camera follows the tower
      const targetCam = Math.max(0, st.blocks.length * BH - 320)
      st.camY += (targetCam - st.camY) * Math.min(1, dt * 0.12)

      // falling debris
      for (const f of st.falling) {
        f.vy += 0.6 * dt
        f.y += f.vy * dt
        f.rot += f.vr * dt
      }
      st.falling = st.falling.filter((f) => f.y < H + 140)

      if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 0.8)

      draw(ctx, st)
    }

    function blockColor(i, light) {
      const hue = (skinRef.current?.hue ?? 158) + i * 4
      return `hsl(${hue}, 48%, ${light ? 63 : 52}%)`
    }

    function drawBlock(ctx, x, y, w, i, light) {
      ctx.fillStyle = blockColor(i, false)
      ctx.fillRect(x, y, w, BH)
      ctx.fillStyle = blockColor(i, true)
      ctx.fillRect(x, y, w, 5)
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(x + w - 5, y, 5, BH)
    }

    function draw(ctx, st) {
      ctx.save()
      if (st.shake > 0) {
        ctx.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake)
      }

      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#182742')
      bg.addColorStop(1, '#233a63')
      ctx.fillStyle = bg
      ctx.fillRect(-12, -12, W + 24, H + 24)

      // faint stars
      ctx.fillStyle = 'rgba(255,255,255,0.16)'
      for (let i = 0; i < 24; i++) {
        const sx = (i * 97.3) % W
        const sy = ((i * 53.7) % 260) - st.camY * 0.25
        ctx.fillRect(sx, sy, 2, 2)
      }

      ctx.translate(0, st.camY)

      // base pedestal
      ctx.fillStyle = '#152238'
      ctx.fillRect(0, BASE_Y + BH, W, H - BASE_Y - BH + 400)
      ctx.fillStyle = 'rgba(34,224,127,0.25)'
      ctx.fillRect(0, BASE_Y + BH, W, 3)

      // tower
      st.blocks.forEach((b, i) => drawBlock(ctx, b.x, b.y, b.w, i, true))

      // moving block + guide
      if (st.cur) {
        const c = st.cur
        ctx.fillStyle = 'rgba(255,255,255,0.14)'
        ctx.fillRect(c.x + c.w / 2 - 1, c.y + BH, 2, 400)
        drawBlock(ctx, c.x, c.y, c.w, st.blocks.length, true)
      }

      // falling debris
      for (const f of st.falling) {
        ctx.save()
        ctx.translate(f.x + f.w / 2, f.y + BH / 2)
        ctx.rotate(f.rot)
        ctx.globalAlpha = 0.9
        ctx.fillStyle = blockColor(st.blocks.length, false)
        ctx.fillRect(-f.w / 2, -BH / 2, f.w, BH)
        ctx.restore()
      }

      ctx.restore()

      // HUD
      ctx.font = '800 34px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.lineWidth = 5
      ctx.strokeStyle = 'rgba(10,18,31,0.6)'
      ctx.strokeText(String(st.score), 16, 48)
      ctx.fillStyle = '#fff'
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
                Drop blocks to build the tower. Every overhang gets sliced off. Pure precision, no luck.
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
              walletMode={walletMode}
            />
          </div>
        )}
      </div>
    </div>
  )
}
