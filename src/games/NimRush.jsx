import { useEffect, useRef, useState } from 'react'
import { drawChicken, drawSun, drawCloud, rr } from '../sketch'
import { CHICK_SKINS } from '../skins'
import { sfx } from '../sound'
import { bestScore, submitScore } from '../leaderboard'
import { getDeviceId } from '../wallet'
import ScoreOverlay from '../components/ScoreOverlay'

const W = 360
const H = 600
const HORIZON = 192
const PLAYER_P = 0.93
const RIVAL = CHICK_SKINS[4] // lava chick

const QUOTES = [
  'The cow did not see you coming. You did not see the cow.',
  'A UFO was involved. We are not making this up.',
  'The sausage wins this round.',
  'Your mustache survived. Barely.',
  'Lane discipline: failed.',
]

const TYPES = ['cow', 'ufo', 'sausage', 'chick', 'cone']

function lerp(a, b, t) {
  return a + (b - a) * t
}
function roadHalf(p) {
  return lerp(16, 152, p)
}
function laneX(lane, p) {
  return W / 2 + (lane - 1) * roadHalf(p) * (2 / 3)
}
function screenY(p) {
  return lerp(HORIZON + 8, 560, p)
}
function scaleOf(p) {
  return lerp(0.18, 1, p)
}

function drawCow(ctx, x, y, s, t) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(0, 3, 34, 8, 0, 0, Math.PI * 2)
  ctx.fill()
  // body
  ctx.fillStyle = '#fff'
  rr(ctx, -30, -34, 60, 36, 13)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 2
  rr(ctx, -30, -34, 60, 36, 13)
  ctx.stroke()
  // spots
  ctx.fillStyle = '#333a45'
  ctx.beginPath()
  ctx.ellipse(-14, -22, 9, 6, 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(13, -14, 8, 5.5, -0.4, 0, Math.PI * 2)
  ctx.fill()
  // head
  ctx.fillStyle = '#fff'
  rr(ctx, -13, -46, 26, 20, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  rr(ctx, -13, -46, 26, 20, 8)
  ctx.stroke()
  // snout
  ctx.fillStyle = '#ffb3c1'
  rr(ctx, -9, -34, 18, 9, 4)
  ctx.fill()
  ctx.fillStyle = '#d97a8c'
  ctx.beginPath()
  ctx.arc(-4, -29.5, 1.4, 0, Math.PI * 2)
  ctx.arc(4, -29.5, 1.4, 0, Math.PI * 2)
  ctx.fill()
  // eyes
  ctx.fillStyle = '#222'
  ctx.beginPath()
  ctx.arc(-6, -41, 2.2, 0, Math.PI * 2)
  ctx.arc(6, -41, 2.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawUfo(ctx, x, y, s, t) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = 'rgba(0,0,0,0.16)'
  ctx.beginPath()
  ctx.ellipse(0, 4, 30, 7, 0, 0, Math.PI * 2)
  ctx.fill()
  // beam
  ctx.fillStyle = 'rgba(120,255,190,0.16)'
  ctx.beginPath()
  ctx.moveTo(-8, 0)
  ctx.lineTo(-18, 24)
  ctx.lineTo(18, 24)
  ctx.lineTo(8, 0)
  ctx.closePath()
  ctx.fill()
  // dish
  const g = ctx.createLinearGradient(0, -14, 0, 0)
  g.addColorStop(0, '#cdd6e0')
  g.addColorStop(1, '#8d99aa')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(0, -4, 30, 10, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 1.6
  ctx.stroke()
  // dome + alien
  ctx.fillStyle = 'rgba(140,220,255,0.85)'
  ctx.beginPath()
  ctx.arc(0, -10, 11, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#37d67a'
  ctx.beginPath()
  ctx.arc(0, -13, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#10131a'
  ctx.beginPath()
  ctx.arc(-2, -14, 1.1, 0, Math.PI * 2)
  ctx.arc(2, -14, 1.1, 0, Math.PI * 2)
  ctx.fill()
  // blinking lights
  const cols = ['#ffd60a', '#ef476f', '#06d6a0']
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = cols[Math.floor(t * 6 + i) % 3]
    ctx.beginPath()
    ctx.arc(-18 + i * 18, -3, 2.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawSausage(ctx, x, y, s, t) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(0, 4, 36, 7, 0, 0, Math.PI * 2)
  ctx.fill()
  // body
  ctx.fillStyle = '#c1613b'
  rr(ctx, -35, -16, 70, 28, 14)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 2
  rr(ctx, -35, -16, 70, 28, 14)
  ctx.stroke()
  // grill marks
  ctx.strokeStyle = 'rgba(90,35,10,0.5)'
  ctx.lineWidth = 2.4
  ctx.beginPath()
  ctx.moveTo(-22, -12)
  ctx.lineTo(-26, 8)
  ctx.moveTo(22, -12)
  ctx.lineTo(26, 8)
  ctx.stroke()
  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  rr(ctx, -28, -12, 56, 6, 3)
  ctx.fill()
  // absurd surprised face
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(-8, -2, 4, 0, Math.PI * 2)
  ctx.arc(8, -2, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#222'
  ctx.beginPath()
  ctx.arc(-8, -2, 1.8, 0, Math.PI * 2)
  ctx.arc(8, -2, 1.8, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#222'
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.arc(0, 5, 3, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawCone(ctx, x, y, s) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(0, 3, 24, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f77f00'
  ctx.beginPath()
  ctx.moveTo(-13, -6)
  ctx.lineTo(-4, -40)
  ctx.lineTo(4, -40)
  ctx.lineTo(13, -6)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1.6
  ctx.stroke()
  // white stripe
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(-9.5, -16)
  ctx.lineTo(-7, -27)
  ctx.lineTo(7, -27)
  ctx.lineTo(9.5, -16)
  ctx.closePath()
  ctx.fill()
  // base
  ctx.fillStyle = '#f77f00'
  rr(ctx, -21, -7, 42, 9, 3)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  rr(ctx, -21, -7, 42, 9, 3)
  ctx.stroke()
  ctx.restore()
}

function triPath(ctx, x, yTop, halfW, yBot) {
  ctx.beginPath()
  ctx.moveTo(x, yTop)
  ctx.lineTo(x - halfW, yBot)
  ctx.lineTo(x + halfW, yBot)
  ctx.closePath()
  ctx.fill()
}

function drawTree(ctx, x, y, s, variant) {
  if (s < 0.06) return
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = 'rgba(0,0,0,0.16)'
  ctx.beginPath()
  ctx.ellipse(0, 1, 22, 5.5, 0, 0, Math.PI * 2)
  ctx.fill()
  if (variant === 0) {
    // trunk
    ctx.fillStyle = '#a8672f'
    rr(ctx, -4.5, -24, 9, 26, 3)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1.6
    rr(ctx, -4.5, -24, 9, 26, 3)
    ctx.stroke()
    // leafy canopy
    ctx.fillStyle = '#3fae4e'
    ctx.beginPath()
    ctx.arc(-10, -30, 12, 0, Math.PI * 2)
    ctx.arc(10, -30, 12, 0, Math.PI * 2)
    ctx.arc(0, -40, 14, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 1.6
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.beginPath()
    ctx.arc(-6, -44, 5.5, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // pine
    ctx.fillStyle = '#8d5524'
    rr(ctx, -3.5, -14, 7, 16, 2)
    ctx.fill()
    ctx.fillStyle = '#2f9e54'
    triPath(ctx, 0, -46, 15, -22)
    triPath(ctx, 0, -38, 19, -14)
    triPath(ctx, 0, -28, 23, -6)
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.lineWidth = 1.4
    triPath(ctx, 0, -38, 19, -14)
    ctx.stroke()
  }
  ctx.restore()
}

function drawObstacle(ctx, o, t) {
  const p = o.p
  const x = laneX(o.lane, p)
  const y = screenY(p)
  const s = scaleOf(p)
  if (o.type === 'cow') drawCow(ctx, x, y, s, t)
  else if (o.type === 'ufo') drawUfo(ctx, x, y, s, t)
  else if (o.type === 'sausage') drawSausage(ctx, x, y, s, t)
  else if (o.type === 'cone') drawCone(ctx, x, y, s)
  else if (o.type === 'chick') {
    drawChicken(ctx, x, y - 18 * s, 1.25 * s, RIVAL, t, t * 10, 0)
    // "!" bubble
    ctx.fillStyle = '#ffd60a'
    ctx.beginPath()
    ctx.arc(x, y - 52 * s, 8 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1.5 * s
    ctx.stroke()
    ctx.fillStyle = '#222'
    ctx.font = `800 ${12 * s}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('!', x, y - 48.5 * s)
  }
}

export default function NimRush({ skin, player, onExit, onScore, requestVerify, walletMode, requestCup }) {
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
  const [best, setBest] = useState(() => bestScore('rush'))
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
      lane: 1,
      x: W / 2,
      dist: 0,
      passBonus: 0,
      obstacles: [],
      spawnT: 0,
      spawnI: 0,
      offset: Math.floor(Math.random() * 3),
      rot: 0,
      fallY: 0,
      deadAt: 0,
      shake: 0,
      lastShown: -1,
      trees: [],
    }

    function makeTree(p) {
      return {
        side: Math.random() < 0.5 ? -1 : 1,
        off: 18 + Math.random() * 42,
        p,
        size: 0.8 + Math.random() * 0.6,
        variant: Math.random() < 0.7 ? 0 : 1,
      }
    }
    st.trees = []
    for (let i = 0; i < 11; i++) {
      st.trees.push(makeTree((i / 11) * 1.2 + Math.random() * 0.05))
    }

    function start() {
      st.phase = 'playing'
      setPhase('playing')
    }

    function finish() {
      st.phase = 'over'
      setPhase('over')
      const finalScore = Math.floor(st.dist) + st.passBonus
      const prevBest = bestScore('rush')
      const isBest = finalScore > prevBest
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
      setScore(finalScore)
      const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      getDeviceId().then((device) => {
        const res = submitScore('rush', {
          id,
          name: playerRef.current || 'Anonymous',
          score: finalScore,
          device,
          verified: false,
          ts: Date.now(),
        })
        setEntry({ id, rank: res.rank, isBest })
        setBest(Math.max(prevBest, finalScore))
        onScoreRef.current?.('rush', finalScore)
      })
    }

    function crash() {
      if (st.phase !== 'playing') return
      st.phase = 'dying'
      st.deadAt = st.t
      st.shake = 10
      sfx.hit()
    }

    function steer(dir) {
      if (st.phase === 'ready') {
        start()
        return
      }
      if (st.phase !== 'playing') return
      st.lane = Math.max(0, Math.min(2, st.lane + dir))
    }

    controls.current.replay = () => {
      st.phase = 'ready'
      st.t = 0
      st.lane = 1
      st.x = W / 2
      st.dist = 0
      st.passBonus = 0
      st.obstacles = []
      st.trees = []
      for (let i = 0; i < 11; i++) {
        st.trees.push(makeTree((i / 11) * 1.2 + Math.random() * 0.05))
      }
      st.spawnT = 0
      st.spawnI = 0
      st.offset = Math.floor(Math.random() * 3)
      st.rot = 0
      st.fallY = 0
      st.shake = 0
      st.lastShown = -1
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
        const speed = 0.3 + Math.min(st.dist * 0.004, 0.3) // progress per second
        st.dist += speed * (dt / 60) * 8

        // smooth lane change
        const target = laneX(st.lane, PLAYER_P)
        st.x += (target - st.x) * Math.min(1, dt * 0.22)

        // spawn (round-robin lanes: every lane is covered within 3 spawns)
        const gap = Math.max(0.62, 1.0 - st.dist * 0.002)
        st.spawnT += dt / 60
        if (st.spawnT >= gap) {
          st.spawnT = 0
          st.spawnI += 1
          const lane = (st.spawnI + st.offset) % 3
          const type = TYPES[(st.spawnI * 7 + st.offset * 3) % TYPES.length]
          st.obstacles.push({ lane, p: 0.02, type })
          if (st.spawnI % 4 === 0) {
            st.obstacles.push({ lane: (lane + 1) % 3, p: 0.02, type: 'cone' })
          }
        }

        // move obstacles
        for (const o of st.obstacles) o.p += speed * (dt / 60)
        for (const o of st.obstacles) {
          if (o.p >= PLAYER_P && !o.done) {
            o.done = true
            if (o.lane === st.lane) crash()
            else st.passBonus += 5
          }
        }
        st.obstacles = st.obstacles.filter((o) => o.p < 1.15)

        // trees scroll with the road, recycle at the horizon
        for (const tr of st.trees) {
          tr.p += speed * (dt / 60)
          if (tr.p > 1.2) Object.assign(tr, makeTree(tr.p - 1.2))
        }

        const shown = Math.floor(st.dist) + st.passBonus
        if (shown !== st.lastShown) {
          st.lastShown = shown
          setScore(shown)
        }
      } else if (st.phase === 'dying') {
        st.rot += 0.16 * dt
        st.fallY += (2 + st.fallY * 0.3) * dt
        if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 0.8)
        if (st.t - st.deadAt > 0.75) finish()
      }

      draw(ctx, st)
    }

    function draw(ctx, st) {
      ctx.save()
      if (st.shake > 0) {
        ctx.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake)
      }

      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#8ee0ff')
      sky.addColorStop(0.5, '#c9f3ff')
      sky.addColorStop(1, '#fff6d8')
      ctx.fillStyle = sky
      ctx.fillRect(-12, -12, W + 24, H + 24)

      drawSun(ctx, 308, 62, 22)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      drawCloud(ctx, 70 + Math.sin(st.t * 0.5) * 8, 70, 0.8)
      drawCloud(ctx, 240 + Math.sin(st.t * 0.4 + 2) * 8, 120, 0.6)

      // hills at horizon
      ctx.fillStyle = 'rgba(122,214,133,0.7)'
      ctx.beginPath()
      ctx.moveTo(-10, HORIZON + 8)
      for (let x = -10; x <= W + 10; x += 12) {
        ctx.lineTo(x, HORIZON + 8 - Math.abs(Math.sin(x * 0.03)) * 16)
      }
      ctx.lineTo(W + 10, HORIZON + 8)
      ctx.closePath()
      ctx.fill()

      // grass
      ctx.fillStyle = '#7ed957'
      ctx.fillRect(-12, HORIZON + 8, W + 24, H - HORIZON)

      // road (extended past the bottom edge so nothing clips)
      const P_MAX = 1.25
      ctx.fillStyle = '#6d7686'
      ctx.beginPath()
      ctx.moveTo(W / 2 - roadHalf(0), screenY(0))
      ctx.lineTo(W / 2 + roadHalf(0), screenY(0))
      ctx.lineTo(W / 2 + roadHalf(P_MAX), screenY(P_MAX))
      ctx.lineTo(W / 2 - roadHalf(P_MAX), screenY(P_MAX))
      ctx.closePath()
      ctx.fill()

      // perspective-correct scrolling segments: rumble strips + lane dashes
      const SEG = 24
      const scroll = st.dist * 0.55
      const off = scroll % 1
      for (let i = 0; i < SEG; i++) {
        const p0 = Math.max(0, (i - off) / SEG)
        const p1 = Math.min(P_MAX, (i + 1 - off) / SEG)
        if (p1 - p0 < 0.002) continue
        const y0 = screenY(p0)
        const y1 = screenY(p1)
        const k = i + Math.floor(scroll)
        // rumble strips on both road edges (alternating red/white)
        ctx.fillStyle = k % 2 === 0 ? '#ef476f' : '#ffffff'
        for (const side of [-1, 1]) {
          const in0 = W / 2 + side * roadHalf(p0)
          const in1 = W / 2 + side * roadHalf(p1)
          const w0 = 10 * scaleOf(p0) + 2
          const w1 = 10 * scaleOf(p1) + 2
          const out0 = W / 2 + side * (roadHalf(p0) + w0)
          const out1 = W / 2 + side * (roadHalf(p1) + w1)
          ctx.beginPath()
          ctx.moveTo(in0, y0)
          ctx.lineTo(out0, y0)
          ctx.lineTo(out1, y1)
          ctx.lineTo(in1, y1)
          ctx.closePath()
          ctx.fill()
        }
        // dashed lane boundary lines
        if (k % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.78)'
          for (const side of [-1, 1]) {
            const c0 = W / 2 + side * (roadHalf(p0) / 3)
            const c1 = W / 2 + side * (roadHalf(p1) / 3)
            const dw0 = 4.5 * scaleOf(p0) + 1
            const dw1 = 4.5 * scaleOf(p1) + 1
            ctx.beginPath()
            ctx.moveTo(c0 - dw0, y0)
            ctx.lineTo(c0 + dw0, y0)
            ctx.lineTo(c1 + dw1, y1)
            ctx.lineTo(c1 - dw1, y1)
            ctx.closePath()
            ctx.fill()
          }
        }
      }

      // roadside trees (far first, perspective scaled)
      const trees = [...st.trees].sort((a, b) => a.p - b.p)
      for (const tr of trees) {
        const s = scaleOf(tr.p) * tr.size
        const x = W / 2 + tr.side * (roadHalf(tr.p) + 24 + tr.off * (0.4 + 0.6 * tr.p))
        drawTree(ctx, x, screenY(tr.p), s, tr.variant)
      }

      // obstacles (far first)
      const obs = [...st.obstacles].sort((a, b) => a.p - b.p)
      for (const o of obs) if (o.p < 1.05) drawObstacle(ctx, o, st.t)

      // player chicken
      const py = 522 + st.fallY
      const bob = st.phase === 'playing' ? Math.sin(st.dist * 1.4) * 2.5 : Math.sin(st.t * 3) * 3
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.beginPath()
      ctx.ellipse(st.x, 548, 24, 7, 0, 0, Math.PI * 2)
      ctx.fill()
      drawChicken(ctx, st.x, py + bob, 1.3, skinRef.current, st.t, st.t * 12, st.rot)

      // HUD: distance
      ctx.font = '800 34px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.lineWidth = 6
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.strokeText(`${Math.floor(st.dist)}m`, 16, 48)
      ctx.fillStyle = '#2b6cb0'
      ctx.fillText(`${Math.floor(st.dist)}m`, 16, 48)

      ctx.restore()
    }

    // ---------------- input ----------------
    const stage = stageRef.current
    const onPointer = (e) => {
      if (e.target.closest && e.target.closest('button')) return
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const rw = rect.width || 1
      const cx = (e.clientX ?? rw / 2) - rect.left
      steer(cx / rw < 0.5 ? -1 : 1)
    }
    stage.addEventListener('pointerdown', onPointer)
    const onKey = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault()
        steer(-1)
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault()
        steer(1)
      } else if ((e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat) {
        e.preventDefault()
        if (st.phase === 'ready') start()
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
        <div className="gamebar-title">NimRush</div>
        <div className="gamebar-best">best {best}</div>
      </div>
      <div className="stage">
        <canvas ref={canvasRef} className="game" />
        {phase === 'ready' && (
          <div className="overlay">
            <div className="panel">
              <h2>NimRush</h2>
              <p className="panel-sub">
                Full speed. Zero brakes. Weave through cows, UFOs and giant sausages.
              </p>
              <p className="panel-hint">TAP LEFT / RIGHT to change lane</p>
            </div>
          </div>
        )}
        {phase === 'over' && (
          <div className="overlay">
            <ScoreOverlay
              gameLabel="NimRush"
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
