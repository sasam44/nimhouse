import { useEffect, useRef, useState } from 'react'
import { drawFly, drawSwatter, drawSun, drawCloud, drawChicken, rr } from '../sketch'
import { sfx } from '../sound'
import { bestScore, submitScore } from '../leaderboard'
import { getDeviceId } from '../wallet'
import ScoreOverlay from '../components/ScoreOverlay'

const W = 360
const H = 600
const MAX_MISS = 5
const HIT_RADIUS = 46

const QUOTES = [
  'The fly saw your swatter. It laughed.',
  'Five misses. The fly had a plan all along.',
  'BONK city. Population: one fly.',
  'It has a mustache and zero fear.',
  'Escape velocity: achieved. By the fly.',
]

const BURSTS = ['BONK!', 'WHACK!', 'SQUISH!', 'POW!', 'THWAP!']

function flyPos(t, score) {
  const A = 118 + 22 * Math.sin(t * 0.31)
  const B = 84 + 18 * Math.sin(t * 0.23 + 2)
  const w1 = 1.1 + Math.min(score * 0.035, 1.5)
  const w2 = 1.7 + Math.min(score * 0.03, 1.7)
  return {
    x: 180 + Math.sin(t * w1) * A,
    y: 245 + Math.sin(t * w2 + 1) * B,
  }
}

export default function NimSwat({ player, onExit, onScore, requestVerify, walletMode, requestCup }) {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const controls = useRef({ replay: () => {} })
  const playerRef = useRef(player)
  playerRef.current = player
  const onScoreRef = useRef(onScore)
  onScoreRef.current = onScore

  const [phase, setPhase] = useState('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => bestScore('swat'))
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
      score: 0,
      miss: 0,
      dizzy: 0,
      swats: [], // {x, y, t, hit}
      bursts: [], // {x, y, t, text, small}
      escapeT: 0,
      shake: 0,
    }

    function start() {
      st.phase = 'playing'
      setPhase('playing')
    }

    function finish() {
      st.phase = 'over'
      setPhase('over')
      const prevBest = bestScore('swat')
      const isBest = st.score > prevBest
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
      const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      getDeviceId().then((device) => {
        const res = submitScore('swat', {
          id,
          name: playerRef.current || 'Anonymous',
          score: st.score,
          device,
          verified: false,
          ts: Date.now(),
        })
        setEntry({ id, rank: res.rank, isBest })
        setBest(Math.max(prevBest, st.score))
        onScoreRef.current?.('swat', st.score)
      })
    }

    function swat(px, py) {
      if (st.phase === 'ready') {
        start()
        return
      }
      if (st.phase !== 'playing' || st.dizzy > 0) return
      st.swats.push({ x: px, y: py, t: 0 })
      const f = flyPos(st.t, st.score)
      const d = Math.hypot(px - f.x, py - f.y)
      if (d <= HIT_RADIUS) {
        st.score += 1
        st.dizzy = 28
        st.bursts.push({ x: f.x, y: f.y, t: 0, text: BURSTS[st.score % BURSTS.length], small: false })
        if (st.score % 5 === 0) sfx.win()
        else sfx.drop()
        setScore(st.score)
      } else {
        st.miss += 1
        st.bursts.push({ x: px, y: py, t: 0, text: 'hehe', small: true })
        sfx.pop()
        if (st.miss >= MAX_MISS) {
          st.phase = 'escaping'
          st.escapeT = 0
          sfx.hit()
        }
      }
    }

    controls.current.replay = () => {
      st.phase = 'ready'
      st.t = 0
      st.score = 0
      st.miss = 0
      st.dizzy = 0
      st.swats = []
      st.bursts = []
      st.escapeT = 0
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
        st.dizzy = Math.max(0, st.dizzy - dt)
      }

      for (const s of st.swats) s.t += dt / 11
      st.swats = st.swats.filter((s) => s.t < 1)
      for (const b of st.bursts) b.t += dt
      st.bursts = st.bursts.filter((b) => b.t < 45)
      if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 0.8)

      if (st.phase === 'escaping') {
        st.escapeT += dt / 60
        if (st.escapeT > 0.95) finish()
      }

      draw(ctx, st)
    }

    function drawBackground(ctx, st) {
      // warm kitchen wall
      const wall = ctx.createLinearGradient(0, 0, 0, H)
      wall.addColorStop(0, '#ffe9c7')
      wall.addColorStop(1, '#ffd9a3')
      ctx.fillStyle = wall
      ctx.fillRect(-12, -12, W + 24, H + 24)

      // window with sky
      ctx.fillStyle = '#fff'
      rr(ctx, 24, 56, 118, 96, 10)
      ctx.fill()
      ctx.strokeStyle = '#c98a4b'
      ctx.lineWidth = 5
      rr(ctx, 24, 56, 118, 96, 10)
      ctx.stroke()
      const sky = ctx.createLinearGradient(0, 61, 0, 147)
      sky.addColorStop(0, '#8ee0ff')
      sky.addColorStop(1, '#d6f4ff')
      ctx.fillStyle = sky
      rr(ctx, 30, 62, 106, 84, 6)
      ctx.fill()
      drawSun(ctx, 110, 88, 12)
      drawCloud(ctx, 62 + Math.sin(st.t * 0.5) * 5, 122, 0.55)
      // window cross
      ctx.strokeStyle = '#c98a4b'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(83, 62)
      ctx.lineTo(83, 146)
      ctx.moveTo(30, 104)
      ctx.lineTo(136, 104)
      ctx.stroke()

      // framed painting of a chicken
      ctx.fillStyle = '#8d5524'
      rr(ctx, 246, 64, 86, 66, 6)
      ctx.fill()
      ctx.fillStyle = '#f1faee'
      rr(ctx, 253, 71, 72, 52, 4)
      ctx.fill()
      drawChicken(ctx, 286, 98, 0.75, { colors: { body: '#fff3d6', wing: '#ffd9a0', comb: '#e63946', beak: '#ff9f1c', mustache: '#5b3a1e' } }, st.t, 0.8)

      // counter (pseudo-3D)
      ctx.fillStyle = '#d18a4a'
      ctx.fillRect(-12, 470, W + 24, 16)
      ctx.fillStyle = '#b06a2c'
      ctx.fillRect(-12, 486, W + 24, H - 486 + 24)
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.fillRect(-12, 486, W + 24, 6)
      // mug on the counter
      ctx.fillStyle = '#4cc9f0'
      rr(ctx, 296, 434, 44, 40, 8)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 2.5
      rr(ctx, 296, 434, 44, 40, 8)
      ctx.stroke()
      ctx.strokeStyle = '#4cc9f0'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.arc(344, 454, 10, -Math.PI / 2, Math.PI / 2)
      ctx.stroke()
      // steam
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(310, 428)
      ctx.quadraticCurveTo(306, 418, 312, 410)
      ctx.moveTo(324, 428)
      ctx.quadraticCurveTo(328, 418, 322, 408)
      ctx.stroke()
    }

    function draw(ctx, st) {
      ctx.save()
      if (st.shake > 0) {
        ctx.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake)
      }

      drawBackground(ctx, st)

      // fly position
      let f = flyPos(st.t, st.score)
      if (st.phase === 'escaping') {
        const e = Math.min(st.escapeT / 0.9, 1)
        f = { x: f.x + (W + 80 - f.x) * e, y: f.y + (-70 - f.y) * e }
      } else if (st.dizzy > 0) {
        f = { x: f.x + Math.sin(st.t * 30) * 3, y: f.y + Math.cos(st.t * 26) * 3 }
      }

      // fly shadow on the wall
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.beginPath()
      ctx.ellipse(f.x + 3, f.y + 9, 9, 3.5, 0, 0, Math.PI * 2)
      ctx.fill()
      drawFly(ctx, f.x, f.y, 1.25, st.t, st.score >= 8 || st.miss >= 3)

      // swat animations (slam from above, scale 2.4 -> 1)
      for (const s of st.swats) {
        const sc = 2.4 - 1.4 * s.t
        ctx.globalAlpha = 1 - Math.max(0, s.t - 0.7) / 0.3
        drawSwatter(ctx, s.x, s.y - (1 - s.t) * 26, sc, -0.5)
        ctx.globalAlpha = 1
      }

      // bursts
      for (const b of st.bursts) {
        const a = Math.max(0, 1 - b.t / 45)
        ctx.globalAlpha = a
        ctx.font = `800 ${b.small ? 15 : 26}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.lineWidth = 5
        ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        const y = b.y - 18 - b.t * 0.6
        ctx.strokeText(b.text, b.x, y)
        ctx.fillStyle = b.small ? '#8ea3c0' : '#ffd60a'
        ctx.fillText(b.text, b.x, y)
        ctx.globalAlpha = 1
      }

      // HUD
      ctx.font = '800 34px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.lineWidth = 6
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.strokeText(String(st.score), 16, 48)
      ctx.fillStyle = '#2b6cb0'
      ctx.fillText(String(st.score), 16, 48)

      // miss tracker (5 flies, crossed out as missed)
      for (let i = 0; i < MAX_MISS; i++) {
        const x = W - 26 - i * 26
        const missed = i < st.miss
        ctx.globalAlpha = missed ? 0.3 : 1
        drawFly(ctx, x, 40, 0.55, 0.6, false)
        if (missed) {
          ctx.globalAlpha = 1
          ctx.strokeStyle = '#e63946'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.moveTo(x - 9, 31)
          ctx.lineTo(x + 9, 49)
          ctx.moveTo(x + 9, 31)
          ctx.lineTo(x - 9, 49)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1

      ctx.restore()
    }

    // ---------------- input ----------------
    const stage = stageRef.current
    const onPointer = (e) => {
      if (e.target.closest && e.target.closest('button')) return
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const rw = rect.width || 1
      const rh = rect.height || 1
      // map CSS pointer position → internal canvas resolution (360x600),
      // so the swatter lands exactly where the finger tapped
      const x = (((e.clientX ?? rw / 2) - rect.left) / rw) * W
      const y = (((e.clientY ?? rh / 2) - rect.top) / rh) * H
      swat(x, y)
    }
    stage.addEventListener('pointerdown', onPointer)
    const onKey = (e) => {
      if ((e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat) {
        e.preventDefault()
        if (st.phase === 'ready') start()
        else if (st.phase === 'playing' && st.dizzy <= 0) {
          const f = flyPos(st.t, st.score)
          swat(f.x, f.y)
        }
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
        <div className="gamebar-title">NimSwat</div>
        <div className="gamebar-best">best {best}</div>
      </div>
      <div className="stage">
        <canvas ref={canvasRef} className="game" />
        {phase === 'ready' && (
          <div className="overlay">
            <div className="panel">
              <h2>NimSwat</h2>
              <p className="panel-sub">
                One angry fly. One flimsy swatter. Tap it before it gets too fast — five misses and
                it escapes for good.
              </p>
              <p className="panel-hint">TAP the fly · SPACE auto-aims</p>
            </div>
          </div>
        )}
        {phase === 'over' && (
          <div className="overlay">
            <ScoreOverlay
              gameLabel="NimSwat"
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
