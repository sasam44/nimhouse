import { useEffect, useRef, useState } from 'react'
import { drawChicken, drawSun, drawCloud, rr } from '../sketch'
import { sfx } from '../sound'
import { bestScore, submitScore } from '../leaderboard'
import { getDeviceId } from '../wallet'
import ScoreOverlay from '../components/ScoreOverlay'

const W = 360
const H = 600
const GROUND_H = 64
const CHICK_X = 78
const CHICK_R = 12
const PIPE_W = 50
const GAP = 172

const QUOTES = [
  'The pipes won. The mustache did not.',
  'Feathers everywhere. Dignity: lost.',
  'That pipe has seen things.',
  'Even absurd chickens crash sometimes.',
  'You flapped. The pipe did not.',
]

function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw))
  const ny = Math.max(ry, Math.min(cy, ry + rh))
  const dx = cx - nx
  const dy = cy - ny
  return dx * dx + dy * dy <= r * r
}

/** cute face on a pipe; pupils look toward the chicken */
function pipeFace(ctx, cx, cy, t, mood) {
  ctx.save()
  const look = Math.sin(t * 1.5) * 0.8
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(cx - 8, cy, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx + 8, cy, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#2b2b2b'
  ctx.beginPath()
  ctx.arc(cx - 8 - 1.4 + look, cy + (mood === 'o' ? 0 : 0.6), 1.9, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx + 8 - 1.4 + look, cy + (mood === 'o' ? 0 : 0.6), 1.9, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#2b2b2b'
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  if (mood === 'o') {
    ctx.beginPath()
    ctx.arc(cx, cy + 8, 2.6, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(cx, cy + 6.5, 3.4, Math.PI * 0.15, Math.PI * 0.85)
    ctx.stroke()
  }
  ctx.restore()
}

function pipeBody(ctx, x, y, w, h, isTop, t, mood) {
  if (h <= 0) return
  const g = ctx.createLinearGradient(x, 0, x + w, 0)
  g.addColorStop(0, '#3fae4e')
  g.addColorStop(0.3, '#6fdc6a')
  g.addColorStop(0.65, '#4cc45c')
  g.addColorStop(1, '#2f8f42')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
  // glossy highlight
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.fillRect(x + 7, y, 9, h)
  // cap (rounded, slightly wider)
  const rimH = 24
  const rimY = isTop ? y + h - rimH : y
  const cg = ctx.createLinearGradient(x - 5, 0, x + w + 5, 0)
  cg.addColorStop(0, '#4cbf5c')
  cg.addColorStop(0.4, '#8ee88a')
  cg.addColorStop(1, '#37934a')
  ctx.fillStyle = cg
  rr(ctx, x - 5, rimY, w + 10, rimH, 7)
  ctx.fill()
  ctx.strokeStyle = 'rgba(20,70,30,0.45)'
  ctx.lineWidth = 2
  rr(ctx, x - 5, rimY, w + 10, rimH, 7)
  ctx.stroke()
  // face near the opening
  const fy = isTop ? rimY - 14 : rimY + rimH + 14
  pipeFace(ctx, x + w / 2, fy, t, mood)
}

export default function NimChick({ skin, player, onExit, onScore, requestVerify, walletMode, requestCup }) {
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
  const [best, setBest] = useState(() => bestScore('chick'))
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
      y: H / 2,
      vy: 0,
      flapAnim: 0,
      pipes: [],
      score: 0,
      deadAt: 0,
      shake: 0,
      groundOff: 0,
      hillsOff: 0,
      clouds: [
        { x: 40, y: 96, s: 1 },
        { x: 220, y: 170, s: 0.7 },
        { x: 330, y: 64, s: 0.85 },
      ],
    }

    function newPipe(x) {
      const margin = 64
      const span = H - GROUND_H - margin * 2 - GAP
      const gapY = margin + GAP / 2 + Math.random() * span
      return { x, gapY, passed: false }
    }

    function start() {
      st.phase = 'playing'
      st.y = H / 2
      st.vy = -6.6
      st.pipes = [newPipe(W + 30), newPipe(W + 30 + 225), newPipe(W + 30 + 450)]
      st.score = 0
      st.flapAnim = 1
      setScore(0)
      setPhase('playing')
      sfx.flap()
    }

    function finish() {
      st.phase = 'over'
      setPhase('over')
      const prevBest = bestScore('chick')
      const isBest = st.score > prevBest
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
      const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      getDeviceId().then((device) => {
        const res = submitScore('chick', {
          id,
          name: playerRef.current || 'Anonymous',
          score: st.score,
          device,
          verified: false,
          ts: Date.now(),
        })
        setEntry({ id, rank: res.rank, isBest })
        setBest(Math.max(prevBest, st.score))
        onScoreRef.current?.('chick', st.score)
      })
    }

    function die() {
      if (st.phase !== 'playing') return
      st.phase = 'dying'
      st.deadAt = st.t
      st.shake = 9
      sfx.hit()
    }

    function flap() {
      if (st.phase === 'over') return
      if (st.phase === 'ready') {
        start()
        return
      }
      if (st.phase === 'playing') {
        st.vy = -6.6
        st.flapAnim = 1
        sfx.flap()
      }
    }

    controls.current.replay = () => {
      st.phase = 'ready'
      st.y = H / 2
      st.vy = 0
      st.pipes = []
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

      if (st.phase === 'playing') {
        st.vy = Math.min(st.vy + 0.36 * dt, 11)
        st.y += st.vy * dt
        st.flapAnim = Math.max(0, st.flapAnim - dt * 0.12)

        const speed = 2.1 + Math.min(st.score * 0.035, 1.2)
        st.groundOff += speed * dt
        st.hillsOff += speed * 0.4 * dt
        for (const p of st.pipes) p.x -= speed * dt
        if (st.pipes[st.pipes.length - 1].x < W - 225) {
          st.pipes.push(newPipe(st.pipes[st.pipes.length - 1].x + 225))
        }
        if (st.pipes[0].x < -PIPE_W - 12) st.pipes.shift()

        for (const p of st.pipes) {
          if (!p.passed && p.x + PIPE_W < CHICK_X - CHICK_R) {
            p.passed = true
            st.score += 1
            setScore(st.score)
            sfx.score()
          }
        }

        if (st.y - CHICK_R <= 0) {
          st.y = CHICK_R
          st.vy = Math.max(st.vy, 0)
        }
        if (st.y + CHICK_R >= H - GROUND_H) {
          st.y = H - GROUND_H - CHICK_R
          die()
        }
        for (const p of st.pipes) {
          const topH = p.gapY - GAP / 2
          const botY = p.gapY + GAP / 2
          if (
            circleRect(CHICK_X, st.y, CHICK_R, p.x, -10, PIPE_W, topH + 10) ||
            circleRect(CHICK_X, st.y, CHICK_R, p.x, botY, PIPE_W, H - GROUND_H - botY)
          ) {
            die()
          }
        }
      } else if (st.phase === 'dying') {
        st.vy = Math.min(st.vy + 0.5 * dt, 13)
        st.y = Math.min(st.y + st.vy * dt, H - GROUND_H - CHICK_R)
        st.flapAnim = 0
        if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 0.8)
        if (st.t - st.deadAt > 0.7) finish()
      } else if (st.phase === 'ready') {
        st.y = H / 2 + Math.sin(st.t * 2.4) * 6
        st.flapAnim = st.t * 4
      }

      draw(ctx, st)
    }

    function hillLayer(ctx, offset, baseY, amp, color, freq) {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(-10, H)
      for (let x = -10; x <= W + 10; x += 10) {
        const y = baseY + Math.sin((x + offset) * freq) * amp
        ctx.lineTo(x, y)
      }
      ctx.lineTo(W + 10, H)
      ctx.closePath()
      ctx.fill()
    }

    function flower(ctx, x, y, c) {
      ctx.fillStyle = c
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2
        ctx.beginPath()
        ctx.arc(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#ffd23f'
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fill()
    }

    function draw(ctx, st) {
      ctx.save()
      if (st.shake > 0) {
        ctx.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake)
      }

      // cheerful sky
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#8ee0ff')
      sky.addColorStop(0.55, '#c8f0ff')
      sky.addColorStop(1, '#fff6d8')
      ctx.fillStyle = sky
      ctx.fillRect(-12, -12, W + 24, H + 24)

      drawSun(ctx, 302, 74, 26)

      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      for (const c of st.clouds) {
        const span = W + 150
        const cx = ((((c.x - st.t * 9 * c.s) % span) + span) % span) - 75
        drawCloud(ctx, cx, c.y, c.s)
      }

      // parallax hills
      hillLayer(ctx, st.hillsOff * 0.6, H - GROUND_H - 54, 22, 'rgba(122,214,133,0.55)', 0.012)
      hillLayer(ctx, st.hillsOff, H - GROUND_H - 26, 16, 'rgba(96,200,110,0.75)', 0.02)

      // pipes (mood: surprised 'o' while dying)
      const mood = st.phase === 'dying' ? 'o' : 'smile'
      for (const p of st.pipes) {
        const topH = p.gapY - GAP / 2
        const botY = p.gapY + GAP / 2
        pipeBody(ctx, p.x, 0, PIPE_W, topH, true, st.t, mood)
        pipeBody(ctx, p.x, botY, PIPE_W, H - GROUND_H - botY, false, st.t, mood)
      }

      // ground
      ctx.fillStyle = '#7ed957'
      ctx.fillRect(-12, H - GROUND_H, W + 24, 12)
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(-12, H - GROUND_H, W + 24, 3)
      ctx.fillStyle = '#e0a55e'
      ctx.fillRect(-12, H - GROUND_H + 12, W + 24, GROUND_H - 12)
      ctx.fillStyle = 'rgba(0,0,0,0.07)'
      const off = st.groundOff % 52
      for (let x = -52 - off; x < W + 52; x += 52) {
        ctx.fillRect(x, H - GROUND_H + 12, 26, GROUND_H - 12)
      }
      // scrolling flowers on the grass line
      const foff = st.groundOff % 90
      for (let x = -90 - foff; x < W + 90; x += 90) {
        flower(ctx, x + 30, H - GROUND_H - 1, x % 180 === 0 ? '#ff8fab' : '#c77dff')
      }

      // the chicken
      const rot =
        st.phase === 'playing' || st.phase === 'dying'
          ? Math.max(-0.45, Math.min(1.2, st.vy * 0.055))
          : 0
      drawChicken(ctx, CHICK_X, st.y, 1.15, skinRef.current, st.t, st.flapAnim * 6 + st.t * 2, rot)

      // score
      if (st.phase === 'playing' || st.phase === 'dying') {
        ctx.font = '800 44px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.lineWidth = 7
        ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.strokeText(String(st.score), W / 2, 74)
        ctx.fillStyle = '#2b6cb0'
        ctx.fillText(String(st.score), W / 2, 74)
      }

      ctx.restore()
    }

    // ---------------- input ----------------
    const stage = stageRef.current
    const onPointer = (e) => {
      if (e.target.closest && e.target.closest('button')) return
      e.preventDefault()
      flap()
    }
    stage.addEventListener('pointerdown', onPointer)
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        if (e.repeat) return
        flap()
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
        <div className="gamebar-title">NimChick</div>
        <div className="gamebar-best">best {best}</div>
      </div>
      <div className="stage">
        <canvas ref={canvasRef} className="game" />
        {phase === 'ready' && (
          <div className="overlay">
            <div className="panel">
              <h2>NimChick</h2>
              <p className="panel-sub">An absurd chicken. Endless pipes with faces. Zero mercy.</p>
              <p className="panel-hint">TAP or SPACE to flap</p>
            </div>
          </div>
        )}
        {phase === 'over' && (
          <div className="overlay">
            <ScoreOverlay
              gameLabel="NimChick"
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
