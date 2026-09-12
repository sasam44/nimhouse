import { useEffect, useRef, useState } from 'react'
import { drawChicken } from '../sketch'
import { sfx } from '../sound'
import { bestScore, submitScore } from '../leaderboard'
import { getDeviceId } from '../wallet'
import ScoreOverlay from '../components/ScoreOverlay'

const W = 360
const H = 600
const GROUND_H = 84
const CHICK_X = 82
const CHICK_R = 15
const PIPE_W = 64
const GAP = 158

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

function cloud(ctx, x, y, s) {
  ctx.beginPath()
  ctx.arc(x, y, 14 * s, 0, Math.PI * 2)
  ctx.arc(x + 16 * s, y + 4 * s, 11 * s, 0, Math.PI * 2)
  ctx.arc(x - 15 * s, y + 5 * s, 10 * s, 0, Math.PI * 2)
  ctx.fill()
}

function pipeBody(ctx, x, y, w, h, isTop) {
  if (h <= 0) return
  const g = ctx.createLinearGradient(x, 0, x + w, 0)
  g.addColorStop(0, '#2f9e54')
  g.addColorStop(0.35, '#4cc473')
  g.addColorStop(1, '#2c8f4c')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(0,0,0,0.14)'
  ctx.fillRect(x, y, 6, h)
  const rimH = 22
  const rimY = isTop ? y + h - rimH : y
  ctx.fillStyle = '#3bb365'
  ctx.fillRect(x - 4, rimY, w + 8, rimH)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 2
  ctx.strokeRect(x - 4, rimY, w + 8, rimH)
}

export default function NimChick({ skin, player, onExit, onScore, requestVerify, walletMode }) {
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
      clouds: [
        { x: 40, y: 90, s: 1 },
        { x: 210, y: 160, s: 0.7 },
        { x: 320, y: 60, s: 0.85 },
      ],
    }

    function newPipe(x) {
      const margin = 70
      const span = H - GROUND_H - margin * 2 - GAP
      const gapY = margin + GAP / 2 + Math.random() * span
      return { x, gapY, passed: false }
    }

    function start() {
      st.phase = 'playing'
      st.y = H / 2
      st.vy = -6.9
      st.pipes = [newPipe(W + 40), newPipe(W + 40 + 215), newPipe(W + 40 + 430)]
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
      st.shake = 10
      sfx.hit()
    }

    function flap() {
      if (st.phase === 'over') return
      if (st.phase === 'ready') {
        start()
        return
      }
      if (st.phase === 'playing') {
        st.vy = -6.9
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
        st.vy = Math.min(st.vy + 0.38 * dt, 11.5)
        st.y += st.vy * dt
        st.flapAnim = Math.max(0, st.flapAnim - dt * 0.12)

        const speed = 2.4 + Math.min(st.score * 0.035, 1.4)
        st.groundOff += speed * dt
        for (const p of st.pipes) p.x -= speed * dt
        if (st.pipes[st.pipes.length - 1].x < W - 215) {
          st.pipes.push(newPipe(st.pipes[st.pipes.length - 1].x + 215))
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
        st.vy = Math.min(st.vy + 0.5 * dt, 14)
        st.y = Math.min(st.y + st.vy * dt, H - GROUND_H - CHICK_R)
        st.flapAnim = 0
        if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 0.8)
        if (st.t - st.deadAt > 0.75) finish()
      } else if (st.phase === 'ready') {
        st.y = H / 2 + Math.sin(st.t * 2.4) * 6
        st.flapAnim = st.t * 4
      }

      draw(ctx, st)
    }

    function draw(ctx, st) {
      ctx.save()
      if (st.shake > 0) {
        ctx.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake)
      }

      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#79c7f0')
      sky.addColorStop(0.7, '#cdeefc')
      sky.addColorStop(1, '#e8f9ff')
      ctx.fillStyle = sky
      ctx.fillRect(-12, -12, W + 24, H + 24)

      ctx.fillStyle = 'rgba(255,224,130,0.9)'
      ctx.beginPath()
      ctx.arc(300, 78, 34, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      for (const c of st.clouds) {
        const span = W + 140
        const cx = ((((c.x - st.t * 10 * c.s) % span) + span) % span) - 70
        cloud(ctx, cx, c.y, c.s)
      }

      for (const p of st.pipes) {
        const topH = p.gapY - GAP / 2
        const botY = p.gapY + GAP / 2
        pipeBody(ctx, p.x, 0, PIPE_W, topH, true)
        pipeBody(ctx, p.x, botY, PIPE_W, H - GROUND_H - botY, false)
      }

      ctx.fillStyle = '#8fd16b'
      ctx.fillRect(-12, H - GROUND_H, W + 24, 14)
      ctx.fillStyle = '#c99a63'
      ctx.fillRect(-12, H - GROUND_H + 14, W + 24, GROUND_H - 14)
      ctx.fillStyle = 'rgba(0,0,0,0.08)'
      const off = st.groundOff % 48
      for (let x = -48 - off; x < W + 48; x += 48) {
        ctx.fillRect(x, H - GROUND_H + 14, 24, GROUND_H - 14)
      }

      const rot =
        st.phase === 'playing' || st.phase === 'dying'
          ? Math.max(-0.5, Math.min(1.25, st.vy * 0.06))
          : 0
      drawChicken(ctx, CHICK_X, st.y, 1.5, skinRef.current, st.t, st.flapAnim * 6 + st.t * 2, rot)

      if (st.phase === 'playing' || st.phase === 'dying') {
        ctx.font = '800 52px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.lineWidth = 6
        ctx.strokeStyle = 'rgba(30,42,60,0.5)'
        ctx.strokeText(String(st.score), W / 2, 84)
        ctx.fillStyle = '#fff'
        ctx.fillText(String(st.score), W / 2, 84)
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
              <p className="panel-sub">An absurd chicken. Endless pipes. Zero mercy. Pure flap skill.</p>
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
              walletMode={walletMode}
            />
          </div>
        )}
      </div>
    </div>
  )
}
