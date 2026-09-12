import { useEffect, useRef, useState } from 'react'
import { drawChicken, drawSausage, rr } from '../sketch'
import { sfx } from '../sound'
import { bestScore, submitScore } from '../leaderboard'
import { getDeviceId } from '../wallet'
import ScoreOverlay from '../components/ScoreOverlay'

const W = 360
const H = 600
const G = 0.18
const R = 16
const COUNTER = 540
const VENTS = [90, 180, 270]
const MAX_MISS = 3

const QUOTES_MISS = [
  'Three sausages walked away. Technically, that is not allowed.',
  'The sausages have voted. You are replaced.',
  'They fell. In slow motion. With smug little faces.',
  'Gravy time — for everyone else.',
]
const QUOTES_BOOM = [
  'BOOM. The black one was a bomb.',
  'The bomb had a mustache too. Rude.',
  'Explosions are not a slicing strategy.',
  'You: one swipe. Bomb: one explosion. Bomb wins.',
]

/** Deterministic sausage volley per wave — same level always yields the same shot list. */
function makeWave(level) {
  const count = Math.min(5 + level, 12)
  const interval = Math.max(36 - level * 1.5, 24)
  const speed = 10.8 + Math.min(level * 0.45, 3.2)
  const jitter = Math.min(1, 0.55 + level * 0.15)
  const list = []
  for (let i = 0; i < count; i++) {
    const x0 = VENTS[i % 3]
    const jx = (((i * 53 + level * 29) % 7) - 3) * 0.55 * jitter
    const jv = 1 + ((i * 31) % 4) * 0.045
    list.push({
      t: i * interval + 8,
      x: x0 + (((i * 13) % 5) - 2) * 9,
      vx: (180 - x0) * 0.006 + jx,
      vy: -(speed * jv),
      bomb: level >= 2 && i === count - 2,
    })
  }
  return list
}

function segHits(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  if (l2 < 0.0001) return (cx - ax) * (cx - ax) + (cy - ay) * (cy - ay) < r * r
  let t = ((cx - ax) * dx + (cy - ay) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  const px = ax + t * dx
  const py = ay + t * dy
  return (cx - px) * (cx - px) + (cy - py) * (cy - py) < r * r
}

function drawBomb(ctx, x, y, rot, t) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  // dark sausage body
  ctx.fillStyle = '#343a4d'
  rr(ctx, -22, -9, 44, 18, 9)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'
  ctx.lineWidth = 1.6
  rr(ctx, -22, -9, 44, 18, 9)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  rr(ctx, -17, -6.5, 34, 4, 2)
  ctx.fill()
  // angry red eyes
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(-5, -1, 2.8, 0, Math.PI * 2)
  ctx.arc(5, -1, 2.8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e63946'
  ctx.beginPath()
  ctx.arc(-4.4, -0.8, 1.4, 0, Math.PI * 2)
  ctx.arc(5.6, -0.8, 1.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#10131a'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-8, -5.4)
  ctx.lineTo(-2.4, -3.4)
  ctx.moveTo(8, -5.4)
  ctx.lineTo(2.4, -3.4)
  ctx.stroke()
  // zigzag mouth
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(-4, 4)
  ctx.lineTo(-2, 5.6)
  ctx.lineTo(0, 4)
  ctx.lineTo(2, 5.6)
  ctx.lineTo(4, 4)
  ctx.stroke()
  // fuse + spark
  ctx.strokeStyle = '#8d6e4a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, -9)
  ctx.quadraticCurveTo(2, -14, 6, -16)
  ctx.stroke()
  const sp = 2.2 + Math.sin(t * 26) * 1.1
  ctx.fillStyle = 'rgba(255,190,60,0.4)'
  ctx.beginPath()
  ctx.arc(7, -17, sp + 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffd60a'
  ctx.beginPath()
  ctx.arc(7, -17, sp, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawHalf(ctx, hf) {
  ctx.save()
  ctx.translate(hf.x, hf.y)
  ctx.rotate(hf.rot)
  ctx.globalAlpha = Math.max(0, hf.life / 38)
  // body
  ctx.fillStyle = '#c1613b'
  ctx.beginPath()
  ctx.ellipse(0, 0, 13, 8.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1.4
  ctx.stroke()
  // cut face (flat, pale, with crumb dots)
  ctx.fillStyle = '#f3e0c2'
  ctx.beginPath()
  ctx.ellipse(11 * hf.dir, 0, 3, 7.4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(150,95,50,0.5)'
  ctx.beginPath()
  ctx.arc(10.5 * hf.dir, -2.4, 0.9, 0, Math.PI * 2)
  ctx.arc(10 * hf.dir, 2.2, 0.9, 0, Math.PI * 2)
  ctx.fill()
  // little eye on the outside
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(-5 * hf.dir, -2, 2.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#222'
  ctx.beginPath()
  ctx.arc(-4.6 * hf.dir, -1.8, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawBunting(ctx) {
  const cols = ['#ef476f', '#ffd60a', '#06d6a0', '#4cc9f0', '#c77dff']
  ctx.strokeStyle = 'rgba(96,56,18,0.35)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, 10)
  ctx.quadraticCurveTo(W / 2, 22, W, 10)
  ctx.stroke()
  for (let i = 0; i < 8; i++) {
    const x = 24 + i * 42
    const y = 11 + Math.sin((i / 7) * Math.PI) * 8
    ctx.fillStyle = cols[i % cols.length]
    ctx.beginPath()
    ctx.moveTo(x - 9, y)
    ctx.lineTo(x + 9, y)
    ctx.lineTo(x, y + 14)
    ctx.closePath()
    ctx.fill()
  }
}

function drawKnife(ctx, x, y, ang) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  // blade
  const g = ctx.createLinearGradient(0, -6, 0, 6)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, '#b9c6d4')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(0, -5)
  ctx.lineTo(26, -3)
  ctx.lineTo(32, 0)
  ctx.lineTo(26, 3)
  ctx.lineTo(0, 5)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1.2
  ctx.stroke()
  // handle
  ctx.fillStyle = '#8d5524'
  rr(ctx, -14, -3.4, 14, 6.8, 3)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  rr(ctx, -14, -3.4, 14, 6.8, 3)
  ctx.stroke()
  ctx.fillStyle = '#ffd60a'
  ctx.beginPath()
  ctx.arc(-7, 0, 1.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export default function NimSlice({ skin, player, onExit, onScore, requestVerify, walletMode }) {
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
  const [best, setBest] = useState(() => bestScore('slice'))
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
      phase: 'ready', // ready | play | wave | over
      t: 0,
      level: 1,
      score: 0,
      misses: 0,
      queue: [],
      waveT: 0,
      sausages: [],
      halves: [],
      parts: [],
      puffs: [],
      pops: [],
      trail: null,
      trailFx: [],
      combo: 0,
      banner: null,
      bannerT: 0,
      shake: 0,
      overReason: 'missed',
      lastShown: -1,
    }

    function reset() {
      st.level = 1
      st.score = 0
      st.misses = 0
      st.queue = makeWave(1)
      st.waveT = 0
      st.sausages = []
      st.halves = []
      st.parts = []
      st.puffs = []
      st.pops = []
      st.trail = null
      st.trailFx = []
      st.combo = 0
      st.banner = null
      st.shake = 0
      st.lastShown = -1
    }

    function start() {
      reset()
      st.phase = 'play'
      setPhase('play')
      setScore(0)
    }

    function finish(reason) {
      st.phase = 'over'
      st.overReason = reason
      setPhase('over')
      const pool = reason === 'boom' ? QUOTES_BOOM : QUOTES_MISS
      const prevBest = bestScore('slice')
      const isBest = st.score > prevBest
      setQuote(pool[Math.floor(Math.random() * pool.length)])
      const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      getDeviceId().then((device) => {
        const res = submitScore('slice', {
          id,
          name: playerRef.current || 'Anonymous',
          score: st.score,
          device,
          verified: false,
          ts: Date.now(),
        })
        setEntry({ id, rank: res.rank, isBest })
        setBest(Math.max(prevBest, st.score))
        onScoreRef.current?.('slice', st.score)
      })
    }

    function juiceFx(x, y, bomb) {
      const cols = bomb
        ? ['#ff9f1c', '#ffd60a', '#e63946', '#ff5d3a']
        : ['#ef476f', '#ffd60a', '#06d6a0', '#4cc9f0', '#ff9f1c']
      const n = bomb ? 26 : 8
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = bomb ? 2 + Math.random() * 5 : 1.5 + Math.random() * 2.5
        st.parts.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 1.5,
          life: bomb ? 34 : 22,
          c: cols[i % cols.length],
          r: bomb ? 3.4 : 2.4,
        })
      }
    }

    function sliceHit(s, px, py, dirx, diry) {
      if (s.bomb) {
        s.dead = true
        st.shake = 14
        juiceFx(s.x, s.y, true)
        st.pops.push({ x: s.x, y: s.y - 26, text: 'BOOM!', c: '#e63946', life: 44 })
        sfx.hit()
        finish('boom')
        return
      }
      s.dead = true
      st.combo += 1
      const bonus = st.combo >= 2 ? 5 * (st.combo - 1) : 0
      st.score += 10 + bonus
      st.pops.push({
        x: s.x,
        y: s.y - 24,
        text: bonus > 0 ? `COMBO +${10 + bonus}` : '+10',
        c: bonus > 0 ? '#ff9f1c' : '#22e07f',
        life: 36,
      })
      // two halves fly apart along the slice direction
      const len = Math.hypot(dirx, diry) || 1
      const nx = -diry / len
      const ny = dirx / len
      for (const d of [-1, 1]) {
        st.halves.push({
          x: s.x + nx * d * 6,
          y: s.y + ny * d * 6,
          vx: s.vx * 0.5 + (dirx / len) * d * -1.2 + (Math.random() - 0.5) * 1.4,
          vy: s.vy * 0.4 - 2.2,
          rot: 0,
          vr: (Math.random() - 0.5) * 0.25,
          life: 38,
          dir: d,
        })
      }
      juiceFx(px, py, false)
      sfx.pop()
    }

    controls.current.replay = () => {
      setEntry(null)
      setQuote('')
      start()
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

      if (st.phase === 'play') {
        st.waveT += dt
        while (st.queue.length && st.queue[0].t <= st.waveT) {
          const q = st.queue.shift()
          st.sausages.push({
            x: q.x,
            y: COUNTER + 26,
            vx: q.vx,
            vy: q.vy,
            rot: 0,
            vr: (q.vx * 0.02),
            bomb: q.bomb,
            dead: false,
          })
          st.puffs.push({ x: q.x, y: COUNTER + 10, life: 16 })
        }
        for (const s of st.sausages) {
          if (s.dead) continue
          s.vy += G * dt
          s.x += s.vx * dt
          s.y += s.vy * dt
          s.rot += s.vr * dt
          if (s.y - R > H + 30) {
            s.dead = true
            st.misses += 1
            st.shake = Math.max(st.shake, 7)
            st.pops.push({
              x: Math.max(46, Math.min(W - 46, s.x)),
              y: 500,
              text: 'MISS',
              c: '#e63946',
              life: 40,
            })
            sfx.drop()
            if (st.misses >= MAX_MISS) {
              finish('missed')
            }
          }
        }
        const alive = st.sausages.filter((s) => !s.dead).length
        if (st.phase === 'play' && !st.queue.length && alive === 0) {
          st.score += 25
          st.banner = `WAVE ${st.level} CLEAR! +25`
          st.bannerT = 0
          st.phase = 'wave'
          sfx.score()
        }
      } else if (st.phase === 'wave') {
        st.bannerT += dt
        if (st.bannerT > 85) {
          st.level += 1
          st.queue = makeWave(st.level)
          st.waveT = 0
          st.sausages = []
          st.banner = null
          st.phase = 'play'
        }
      }

      // halves
      for (const hf of st.halves) {
        hf.vy += G * dt
        hf.x += hf.vx * dt
        hf.y += hf.vy * dt
        hf.rot += hf.vr * dt
        hf.life -= dt
      }
      st.halves = st.halves.filter((hf) => hf.life > 0)
      // juice particles
      for (const p of st.parts) {
        p.vy += 0.2 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
      }
      st.parts = st.parts.filter((p) => p.life > 0)
      // puffs
      for (const p of st.puffs) p.life -= dt
      st.puffs = st.puffs.filter((p) => p.life > 0)
      // text pops
      for (const p of st.pops) {
        p.y -= 0.7 * dt
        p.life -= dt
      }
      st.pops = st.pops.filter((p) => p.life > 0)
      // trail fx fade
      for (const p of st.trailFx) p.life -= dt
      st.trailFx = st.trailFx.filter((p) => p.life > 0)
      if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 0.8)

      if (st.score !== st.lastShown) {
        st.lastShown = st.score
        setScore(st.score)
      }

      draw(ctx, st)
    }

    function draw(ctx, st) {
      ctx.save()
      if (st.shake > 0.5) {
        ctx.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake)
      }

      // kitchen wall
      const wall = ctx.createLinearGradient(0, 0, 0, H)
      wall.addColorStop(0, '#fff6e0')
      wall.addColorStop(0.75, '#ffe3b8')
      wall.addColorStop(1, '#ffd9a0')
      ctx.fillStyle = wall
      ctx.fillRect(-14, -14, W + 28, H + 28)
      // subtle wall dots
      ctx.fillStyle = 'rgba(214,160,90,0.16)'
      for (let y = 40; y < COUNTER; y += 46) {
        for (let x = 20 + (Math.floor(y / 46) % 2) * 23; x < W; x += 46) {
          ctx.beginPath()
          ctx.arc(x, y, 2.2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      drawBunting(ctx)

      // counter
      ctx.fillStyle = '#c98a4b'
      ctx.fillRect(-14, COUNTER, W + 28, H - COUNTER + 14)
      ctx.fillStyle = '#e8b877'
      ctx.fillRect(-14, COUNTER, W + 28, 6)
      ctx.fillStyle = 'rgba(0,0,0,0.1)'
      for (let x = -30; x < W + 30; x += 60) {
        ctx.fillRect(x, COUNTER + 6, 3, H - COUNTER)
      }
      // launch vents
      for (const vx of VENTS) {
        ctx.fillStyle = '#7a4a1e'
        rr(ctx, vx - 24, COUNTER + 14, 48, 14, 7)
        ctx.fill()
        ctx.fillStyle = '#2b1a0c'
        rr(ctx, vx - 19, COUNTER + 17, 38, 8, 4)
        ctx.fill()
      }
      // launch puffs
      for (const p of st.puffs) {
        ctx.globalAlpha = Math.max(0, p.life / 16) * 0.7
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(p.x, p.y - (16 - p.life) * 0.8, 4 + (16 - p.life) * 0.7, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // chef chick on the counter
      drawChicken(ctx, 42, COUNTER - 26, 0.95, skinRef.current, st.t, st.t * 3.2, 0.04)

      // puffs behind sausages done; draw trail fx
      if (st.trailFx.length > 1) {
        ctx.lineCap = 'round'
        for (let i = 1; i < st.trailFx.length; i++) {
          const a = st.trailFx[i - 1]
          const b = st.trailFx[i]
          const w = Math.max(1, 8.5 * (b.life / 16))
          ctx.globalAlpha = (b.life / 16) * 0.4
          ctx.strokeStyle = '#ef476f'
          ctx.lineWidth = w + 3
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
          ctx.globalAlpha = b.life / 16
          ctx.strokeStyle = '#fff7e0'
          ctx.lineWidth = w
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        const tp = st.trailFx[st.trailFx.length - 1]
        if (st.trail) {
          const prev = st.trailFx[st.trailFx.length - 2] || st.trail
          const ang = Math.atan2(st.trail.y - prev.y, st.trail.x - prev.x)
          drawKnife(ctx, tp.x, tp.y, ang)
        }
      } else if (st.trail) {
        drawKnife(ctx, st.trail.x, st.trail.y, -0.4)
      }

      // sausages
      for (const s of st.sausages) {
        if (s.dead) continue
        ctx.fillStyle = 'rgba(0,0,0,0.12)'
        ctx.beginPath()
        ctx.ellipse(s.x, COUNTER + 8, 14, 3, 0, 0, Math.PI * 2)
        ctx.fill()
        if (s.bomb) drawBomb(ctx, s.x, s.y, s.rot * 0.5, st.t)
        else drawSausage(ctx, s.x, s.y, 1, s.rot)
      }

      // sliced halves
      for (const hf of st.halves) drawHalf(ctx, hf)

      // juice particles
      for (const p of st.parts) {
        ctx.globalAlpha = Math.max(0, p.life / 26)
        ctx.fillStyle = p.c
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // text pops
      for (const p of st.pops) {
        ctx.globalAlpha = Math.min(1, p.life / 14)
        ctx.font = '800 17px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.lineWidth = 4
        ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(255,255,255,0.92)'
        ctx.strokeText(p.text, p.x, p.y)
        ctx.fillStyle = p.c
        ctx.fillText(p.text, p.x, p.y)
      }
      ctx.globalAlpha = 1

      // HUD
      ctx.textAlign = 'left'
      ctx.font = '700 11px system-ui, sans-serif'
      ctx.lineWidth = 4
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.strokeText('SCORE', 16, 30)
      ctx.fillStyle = '#b06a2c'
      ctx.fillText('SCORE', 16, 30)
      ctx.font = '800 26px system-ui, sans-serif'
      ctx.strokeText(String(st.score), 16, 58)
      ctx.fillStyle = '#b06a2c'
      ctx.fillText(String(st.score), 16, 58)
      ctx.textAlign = 'center'
      ctx.font = '800 15px system-ui, sans-serif'
      ctx.strokeText(`WAVE ${st.level}`, W / 2, 34)
      ctx.fillStyle = '#ef476f'
      ctx.fillText(`WAVE ${st.level}`, W / 2, 34)
      // lives (hearts)
      ctx.textAlign = 'right'
      ctx.font = '22px system-ui, sans-serif'
      for (let i = 0; i < MAX_MISS; i++) {
        const lost = i < st.misses
        ctx.globalAlpha = lost ? 0.25 : 1
        ctx.lineWidth = 4
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.strokeText('♥', W - 14 - (MAX_MISS - 1 - i) * 24, 38)
        ctx.fillStyle = lost ? '#9aa0a6' : '#e63946'
        ctx.fillText('♥', W - 14 - (MAX_MISS - 1 - i) * 24, 38)
      }
      ctx.globalAlpha = 1

      // wave banner
      if (st.banner) {
        const sc = 1 + Math.max(0, 0.3 - st.bannerT * 0.012)
        ctx.save()
        ctx.translate(W / 2, 190)
        ctx.scale(sc, sc)
        ctx.font = '800 27px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.lineWidth = 7
        ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'
        ctx.strokeText(st.banner, 0, 0)
        ctx.fillStyle = '#22e07f'
        ctx.fillText(st.banner, 0, 0)
        ctx.restore()
      }

      // first-wave hint
      if (st.phase === 'play' && st.level === 1 && st.waveT < 150 && !st.trail) {
        ctx.font = '700 13px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(120,70,20,0.75)'
        ctx.fillText('SWIPE across the sausages to slice them!', W / 2, 528)
      }

      ctx.restore()
    }

    // ---------------- input ----------------
    const toCanvas = (e) => {
      const rect = canvas.getBoundingClientRect()
      const rw = rect.width || 1
      const rh = rect.height || 1
      return {
        x: (((e.clientX ?? rw / 2) - rect.left) / rw) * W,
        y: (((e.clientY ?? rh / 2) - rect.top) / rh) * H,
      }
    }

    const stage = stageRef.current
    const onPointerDown = (e) => {
      if (e.target.closest && e.target.closest('button')) return
      e.preventDefault()
      if (st.phase === 'ready') start()
      st.combo = 0
      const p = toCanvas(e)
      st.trail = p
      st.trailFx.push({ x: p.x, y: p.y, life: 16 })
    }
    const onPointerMove = (e) => {
      if (!st.trail) return
      const p = toCanvas(e)
      const d = Math.hypot(p.x - st.trail.x, p.y - st.trail.y)
      if (d < 2) return
      // event-driven slice check (covers the whole swipe segment — no tunneling)
      if (st.phase === 'play') {
        const dirx = p.x - st.trail.x
        const diry = p.y - st.trail.y
        for (const s of st.sausages) {
          if (!s.dead && segHits(st.trail.x, st.trail.y, p.x, p.y, s.x, s.y, R)) {
            sliceHit(s, p.x, p.y, dirx, diry)
          }
        }
      }
      st.trail = p
      st.trailFx.push({ x: p.x, y: p.y, life: 16 })
      if (st.trailFx.length > 26) st.trailFx.shift()
    }
    const onPointerUp = () => {
      st.trail = null
    }
    stage.addEventListener('pointerdown', onPointerDown)
    stage.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    const onKey = (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat && st.phase === 'ready') {
        e.preventDefault()
        start()
      }
    }
    window.addEventListener('keydown', onKey)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      stage.removeEventListener('pointerdown', onPointerDown)
      stage.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="gameview" ref={stageRef}>
      <div className="gamebar">
        <button className="btn icon ghost" onClick={onExit} aria-label="Back">
          ←
        </button>
        <div className="gamebar-title">NimSlice</div>
        <div className="gamebar-best">best {best}</div>
      </div>
      <div className="stage">
        <canvas ref={canvasRef} className="game" />
        {phase === 'ready' && (
          <div className="overlay">
            <div className="panel">
              <h2>NimSlice</h2>
              <p className="panel-sub">
                The sausages are flying again. Swipe to slice them all — every wave a little
                bigger, a little faster.
              </p>
              <p className="panel-hint">SWIPE to slice · 3 escapes = game over</p>
              <p className="panel-hint">⚠ Never slice the black one. It is a bomb.</p>
            </div>
          </div>
        )}
        {phase === 'over' && (
          <div className="overlay">
            <ScoreOverlay
              gameLabel="NimSlice"
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
