import { useEffect, useRef, useState } from 'react'
import { drawChicken, drawSun, drawCloud, rr } from '../sketch'
import { sfx, setMuted, isMuted } from '../sound'
import { bestScore, submitScore } from '../leaderboard'
import { getDeviceId } from '../wallet'
import ScoreOverlay from '../components/ScoreOverlay'

const W = 360
const H = 600
const CHICK_X = 92
const CHICK_HALF = 11
const CHICK_W = 24
const G = 0.42 // px/frame^2
const JUMP_V = -9.9 // px/frame
const HOLD_FRAMES = 16 // frames of reduced gravity while holding & rising
const BASE_SPEED = 4.3
const MAX_SPEED_BONUS = 2.9
const STREET_Y = 540
const SEED = 42 // fixed course — deterministic, testable

const QUOTES = [
  'The pigeon union is filing a formal complaint.',
  'You were faster than the AC units. Barely.',
  'Gravity collected its dues. Three times.',
  'The rooftops are longer than they look.',
  'Next time, look left-ish. The gaps like corners.',
]

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function drawPigeon(ctx, x, y, t) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(-1, 1) // pigeons drift toward the runner (left)
  // body
  ctx.fillStyle = '#9aa5b1'
  ctx.beginPath()
  ctx.ellipse(0, 0, 11, 7.5, 0, 0, Math.PI * 2)
  ctx.fill()
  // wing
  ctx.fillStyle = '#64748b'
  ctx.beginPath()
  ctx.ellipse(-2, -1 + Math.sin(t * 0.6) * 1.8, 6.5, 4, -0.35, 0, Math.PI * 2)
  ctx.fill()
  // head
  ctx.fillStyle = '#cbd5e1'
  ctx.beginPath()
  ctx.arc(9, -5.5, 5, 0, Math.PI * 2)
  ctx.fill()
  // beak
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  ctx.moveTo(13.5, -6)
  ctx.lineTo(18, -5)
  ctx.lineTo(13.5, -3.5)
  ctx.closePath()
  ctx.fill()
  // eye
  ctx.fillStyle = '#1f2937'
  ctx.fillRect(10.5, -7, 1.8, 1.8)
  ctx.restore()
}

function drawAcUnit(ctx, x, y, w, h) {
  ctx.fillStyle = '#94a3b8'
  rr(ctx, x - w / 2, y - h, w, h, 3)
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  for (let i = 0; i < 3; i++) ctx.fillRect(x - w / 2 + 3, y - h + 4 + i * 4.4, w - 6, 2)
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillRect(x - w / 2, y - h, w, 2)
}

function drawLunaCoin(ctx, x, y, t) {
  ctx.save()
  ctx.translate(x, y)
  const sq = 0.8 + 0.2 * Math.abs(Math.sin(t * 0.08 + x * 0.03))
  ctx.scale(sq, 1)
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.arc(0, 0, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#b45309'
  ctx.lineWidth = 1.6
  ctx.stroke()
  // crescent (NIM = Luna)
  ctx.fillStyle = '#92400e'
  ctx.beginPath()
  ctx.arc(-1, 0, 5.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.arc(1.4, -1.6, 4.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export default function NimRooftop({ skin, player, onExit, onScore, requestVerify, walletMode, requestCup }) {
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
  const [best, setBest] = useState(() => bestScore('run'))
  const [muted, setMutedUI] = useState(() => isMuted())
  const [quote, setQuote] = useState('')
  const [entry, setEntry] = useState(null)

  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const st = {
      phase: 'ready', // ready | play | over
      f: 0, // frames (animation clock)
      dist: 0, // px travelled
      speed: BASE_SPEED,
      chickY: 430 - CHICK_HALF,
      vy: 0,
      onGround: true,
      holding: false,
      holdBoost: 0,
      jumpBuffer: 0,
      invuln: 0,
      lives: 3,
      coins: 0,
      score: 0,
      lastShown: -1,
      // world (seeded, generated ahead)
      rng: mulberry32(SEED),
      buildings: [],
      genX: 0,
      goT: 0,
      // fx
      popups: [],
      parts: [],
    }

    function genBuilding(prev) {
      const r = st.rng
      let gap = 0
      if (prev && r() < 0.55) gap = 36 + r() * (50 + Math.min(52, st.dist / 26))
      const w = 110 + r() * 150
      const roofY = Math.round(prev ? clamp(prev.roofY + (r() * 110 - 55), 350, 480) : 430)
      const b = {
        x0: (prev ? prev.x1 : 0) + gap,
        roofY,
        gap,
        obs: [],
        coinsArr: [],
        alt: st.buildings.length % 2 === 0,
      }
      b.x1 = b.x0 + w
      // obstacles — never on the opening buildings, never within 48px of an edge
      if (b.x0 > 650 && b.gap === 0) {
        let n = w > 200 ? (r() < 0.6 ? 2 : 1) : r() < 0.55 ? 1 : 0
        let tries = 0
        while (n > 0 && tries < 8) {
          tries++
          const type = r() < 0.5 ? 'ac' : 'pigeon'
          const ox = b.x0 + 48 + r() * (w - 96)
          if (b.obs.every((o) => Math.abs(o.x - ox) > 110)) {
            b.obs.push({
              x: ox,
              type,
              w: type === 'ac' ? 26 : 22,
              h: type === 'ac' ? 20 : 15,
              vx: type === 'pigeon' ? -(0.8 + r() * 0.7) : 0,
              taken: false,
              bob: r() * 6.28,
            })
            n--
          }
        }
      }
      // coins — arc over the gap, or a row on a long roof
      if (b.gap > 0 && prev) {
        const g0 = b.x0 - b.gap
        const g1 = b.x0
        for (let i = 0; i < 5; i++) {
          const k = i / 4
          const baseY = prev.roofY + (b.roofY - prev.roofY) * k
          b.coinsArr.push({ x: g0 + (g1 - g0) * k, y: baseY - 34 - Math.sin(k * Math.PI) * 58, taken: false })
        }
      } else if (b.gap === 0 && w > 150 && r() < 0.7) {
        const sx = b.x0 + 44 + r() * (w - 122)
        for (let i = 0; i < 3; i++) b.coinsArr.push({ x: sx + i * 26, y: b.roofY - 58, taken: false })
      }
      return b
    }

    function ensureWorld() {
      let guard = 0
      while (st.genX < st.dist + W + 240 && guard++ < 50) {
        const last = st.buildings[st.buildings.length - 1]
        const b = genBuilding(last)
        st.buildings.push(b)
        st.genX = b.x1
      }
      while (st.buildings.length && st.buildings[0].x1 < st.dist - 260) st.buildings.shift()
    }

    function start() {
      st.f = 0
      st.dist = 0
      st.speed = BASE_SPEED
      st.vy = 0
      st.chickY = 430 - CHICK_HALF
      st.onGround = true
      st.holding = false
      st.holdBoost = 0
      st.jumpBuffer = 0
      st.invuln = 50 // short grace while the GO! banner shows
      st.lives = 3
      st.coins = 0
      st.score = 0
      st.lastShown = -1
      st.rng = mulberry32(SEED)
      st.buildings = [genBuilding(null)]
      st.genX = st.buildings[0].x1
      st.popups = []
      st.parts = []
      st.goT = 46
      st.phase = 'play'
      setPhase('play')
      setScore(0)
      sfx.pop()
    }

    function finish() {
      st.phase = 'over'
      setPhase('over')
      const prevBest = bestScore('run')
      const isBest = st.score > prevBest
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
      const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      getDeviceId().then((device) => {
        const res = submitScore('run', {
          id,
          name: playerRef.current || 'Anonymous',
          score: st.score,
          device,
          verified: false,
          ts: Date.now(),
        })
        setEntry({ id, rank: res.rank, isBest })
        setBest(Math.max(prevBest, st.score))
        onScoreRef.current?.('run', st.score)
      })
      sfx.hit()
    }

    function jump() {
      if (st.phase !== 'play') return
      if (st.onGround) {
        st.vy = JUMP_V
        st.onGround = false
        st.holdBoost = HOLD_FRAMES
        sfx.flap()
        for (let i = 0; i < 5; i++) {
          st.parts.push({
            x: CHICK_X - 6,
            y: st.chickY + CHICK_HALF,
            vx: -1.2 - Math.random() * 1.4,
            vy: -Math.random() * 0.8,
            life: 16,
            col: 'rgba(255,255,255,0.8)',
          })
        }
      } else {
        st.jumpBuffer = 8 // buffered: auto-jump the moment we land
      }
    }

    function loseLifeAt(x, y, fell) {
      st.lives -= 1
      sfx.hit()
      st.popups.push({ x: fell ? CHICK_X : x, y: (fell ? 120 : y) - 24, text: '-1', life: 50, col: '#e63946' })
      if (!fell) {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2
          st.parts.push({ x, y, vx: Math.cos(a) * 2.4, vy: Math.sin(a) * 2.4, life: 30, col: '#ffd166' })
        }
      }
      if (st.lives <= 0) finish()
    }

    controls.current.replay = () => {
      setEntry(null)
      setQuote('')
      start()
    }

    let raf = 0
    let last = performance.now()

    function frame(now) {
      raf = requestAnimationFrame(frame)
      let dt = (now - last) / (1000 / 60)
      last = now
      if (dt > 3) dt = 3
      st.f += dt

      if (st.phase === 'play') {
        st.speed = BASE_SPEED + Math.min(MAX_SPEED_BONUS, st.f * 0.0015)
        st.dist += st.speed * dt
        if (st.goT > 0) st.goT -= dt
        if (st.invuln > 0) st.invuln -= dt
        ensureWorld()

        const wx = st.dist + CHICK_X
        let cur = null
        for (const b of st.buildings) {
          if (wx >= b.x0 - 6 && wx <= b.x1 + 6) {
            cur = b
            break
          }
        }
        const groundY = cur ? cur.roofY : Infinity

        // pigeons drift (bounce inside their roof)
        for (const b of st.buildings) {
          for (const o of b.obs) {
            if (o.type !== 'pigeon' || o.taken) continue
            o.x += o.vx * dt
            if (o.x < b.x0 + 16 || o.x > b.x1 - 16) o.vx *= -1
          }
        }

        // physics
        const g = st.holding && st.vy < 0 && st.holdBoost > 0 ? G * 0.55 : G
        if (st.holdBoost > 0) st.holdBoost -= dt
        if (st.jumpBuffer > 0) st.jumpBuffer -= dt
        st.vy += g * dt
        st.chickY += st.vy * dt
        if (st.vy >= 0 && st.chickY >= groundY - CHICK_HALF) {
          st.chickY = groundY - CHICK_HALF
          st.vy = 0
          if (!st.onGround) {
            for (let i = 0; i < 4; i++) {
              st.parts.push({
                x: CHICK_X - 4,
                y: st.chickY + CHICK_HALF,
                vx: -0.8 - Math.random(),
                vy: -Math.random() * 0.6,
                life: 14,
                col: 'rgba(255,255,255,0.7)',
              })
            }
          }
          st.onGround = true
          if (st.jumpBuffer > 0) {
            st.jumpBuffer = 0
            st.vy = JUMP_V
            st.onGround = false
            st.holdBoost = HOLD_FRAMES
            sfx.flap()
          }
        }
        if (st.onGround && cur === null) st.onGround = false

        // fell into a gap
        if (st.chickY > H + 30) {
          loseLifeAt(CHICK_X, 0, true)
          if (st.phase !== 'play') {
            draw(ctx, st)
            return
          }
          let nb = null
          let guard = 0
          while (!nb && guard++ < 40) {
            ensureWorld()
            nb = st.buildings.find((b) => b.x0 > wx + 20)
          }
          st.dist = nb.x0 + 42 - CHICK_X
          st.chickY = nb.roofY - CHICK_HALF
          st.vy = 0
          st.onGround = true
          st.invuln = 100
        }

        // obstacle hits
        if (st.invuln <= 0) {
          outer: for (const b of st.buildings) {
            for (const o of b.obs) {
              if (o.taken) continue
              const ox = o.x - st.dist
              if (ox < -50 || ox > W + 50) continue
              const bobY = o.type === 'pigeon' ? 5 + Math.sin(st.f * 0.15 + o.bob) * 5 : 0
              const oTop = b.roofY - o.h - bobY
              const oBot = oTop + o.h
              const cL = CHICK_X - CHICK_W / 2 + 3
              const cR = CHICK_X + CHICK_W / 2 - 3
              const cT = st.chickY - CHICK_HALF + 3
              const cB = st.chickY + CHICK_HALF - 3
              if (ox - o.w / 2 + 3 < cR && ox + o.w / 2 - 3 > cL && oTop + 3 < cB && oBot - 3 > cT) {
                if (o.type === 'pigeon') o.taken = true
                st.invuln = 90
                loseLifeAt(CHICK_X, st.chickY - 12, false)
                break outer
              }
            }
          }
          if (st.phase !== 'play') {
            draw(ctx, st)
            return
          }
        }

        // coins
        for (const b of st.buildings) {
          for (const c of b.coinsArr) {
            if (c.taken) continue
            const cx = c.x - st.dist
            if (cx < -30 || cx > W + 30) continue
            if (Math.abs(cx - CHICK_X) < 22 && Math.abs(c.y - st.chickY) < 26) {
              c.taken = true
              st.coins += 1
              sfx.pop()
              for (let i = 0; i < 5; i++) {
                st.parts.push({
                  x: cx,
                  y: c.y,
                  vx: (Math.random() - 0.5) * 3,
                  vy: -Math.random() * 2.6,
                  life: 20,
                  col: '#fbbf24',
                })
              }
            }
          }
        }

        st.score = Math.floor(st.dist / 24) + st.coins * 5
      }

      for (const pp of st.popups) {
        pp.y -= 0.5 * dt
        pp.life -= dt
      }
      st.popups = st.popups.filter((pp) => pp.life > 0)
      for (const pt of st.parts) {
        pt.x += pt.vx * dt
        pt.y += pt.vy * dt
        pt.life -= dt
      }
      st.parts = st.parts.filter((pt) => pt.life > 0)

      if (st.score !== st.lastShown) {
        st.lastShown = st.score
        setScore(st.score)
      }

      draw(ctx, st)
    }

    function draw(ctx, st) {
      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#7ec8f2')
      sky.addColorStop(0.7, '#bfe6fb')
      sky.addColorStop(1, '#e8f7ff')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)
      drawSun(ctx, 306, 74, 20)
      for (let i = 0; i < 3; i++) {
        const cx = ((((i * 190 + 40 - st.dist * 0.15) % (W + 160)) + W + 160) % (W + 160)) - 80
        drawCloud(ctx, cx, 64 + i * 46, 0.5 + (i % 2) * 0.2)
      }
      // far skyline (slow parallax)
      const farOff = (st.dist * 0.35) % 160
      const farCol0 = Math.floor(((st.dist * 0.35 - 160) / 160))
      ctx.fillStyle = 'rgba(120,150,175,0.5)'
      for (let x = -farOff - 160; x < W + 160; x += 160) {
        const idx = farCol0 + Math.round((x + farOff) / 160)
        const bh = 110 + ((idx * 37) % 90)
        ctx.fillRect(x + 20, STREET_Y - bh, 100, bh)
      }

      // buildings
      for (const b of st.buildings) {
        const x0 = b.x0 - st.dist
        const x1 = b.x1 - st.dist
        if (x1 < -30 || x0 > W + 30) continue
        ctx.fillStyle = b.alt ? '#8d6e63' : '#795548'
        ctx.fillRect(x0, b.roofY, x1 - x0, STREET_Y - b.roofY)
        // roof slab
        ctx.fillStyle = '#4e342e'
        ctx.fillRect(x0 - 3, b.roofY - 6, x1 - x0 + 6, 8)
        ctx.fillStyle = 'rgba(255,255,255,0.28)'
        ctx.fillRect(x0 - 3, b.roofY - 6, x1 - x0 + 6, 2)
        // windows
        ctx.fillStyle = 'rgba(255,236,179,0.55)'
        for (let wy = b.roofY + 16; wy < STREET_Y - 22; wy += 30) {
          for (let wxi = x0 + 12; wxi < x1 - 20; wxi += 34) ctx.fillRect(wxi, wy, 14, 18)
        }
        // side shadow
        ctx.fillStyle = 'rgba(0,0,0,0.16)'
        ctx.fillRect(x1 - 9, b.roofY, 9, STREET_Y - b.roofY)
      }

      // chasm below the streets
      const chasm = ctx.createLinearGradient(0, STREET_Y, 0, H)
      chasm.addColorStop(0, 'rgba(15,23,42,0.55)')
      chasm.addColorStop(1, 'rgba(2,6,23,0.95)')
      ctx.fillStyle = chasm
      ctx.fillRect(0, STREET_Y, W, H - STREET_Y)
      // street dashes (fast parallax, in the chasm)
      const dashOff = st.dist % 80
      ctx.fillStyle = 'rgba(148,163,184,0.3)'
      for (let x = -dashOff; x < W; x += 80) ctx.fillRect(x, STREET_Y + 18, 36, 5)

      // obstacles + coins
      for (const b of st.buildings) {
        for (const o of b.obs) {
          if (o.taken) continue
          const ox = o.x - st.dist
          if (ox < -50 || ox > W + 50) continue
          if (o.type === 'ac') drawAcUnit(ctx, ox, b.roofY, o.w, o.h)
          else drawPigeon(ctx, ox, b.roofY - o.h / 2 - (5 + Math.sin(st.f * 0.15 + o.bob) * 5), st.f)
        }
        for (const c of b.coinsArr) {
          if (c.taken) continue
          const cx = c.x - st.dist
          if (cx < -30 || cx > W + 30) continue
          drawLunaCoin(ctx, cx, c.y, st.f)
        }
      }

      // chick (blink while invulnerable)
      const blink = st.invuln > 0 && Math.floor(st.f / 4) % 2 === 0
      if (!blink) {
        const bob = st.onGround ? Math.sin(st.f * 0.9) * 1.5 : 0
        const flap = st.onGround ? Math.sin(st.f * 0.9) * 0.5 : 3
        const rot = st.onGround ? 0.04 : clamp(st.vy * 0.03, -0.25, 0.4)
        drawChicken(ctx, CHICK_X, st.chickY + bob, 1.0, skinRef.current, st.f / 60, flap, rot)
      }

      // particles
      for (const pt of st.parts) {
        ctx.fillStyle = pt.col
        ctx.globalAlpha = Math.min(1, pt.life / 16)
        ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4)
      }
      ctx.globalAlpha = 1

      // popups
      for (const pp of st.popups) {
        ctx.font = 'bold 16px system-ui'
        ctx.textAlign = 'center'
        ctx.fillStyle = pp.col
        ctx.globalAlpha = Math.min(1, pp.life / 20)
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'
        ctx.lineWidth = 3
        ctx.strokeText(pp.text, pp.x, pp.y)
        ctx.fillText(pp.text, pp.x, pp.y)
      }
      ctx.globalAlpha = 1

      // ---------- HUD ----------
      ctx.font = '15px system-ui'
      ctx.textAlign = 'left'
      let hearts = ''
      for (let i = 0; i < 3; i++) hearts += i < st.lives ? '❤️' : '🖤'
      ctx.fillStyle = 'rgba(18,30,49,0.75)'
      rr(ctx, 8, 8, 66, 22, 11)
      ctx.fill()
      ctx.fillText(hearts, 14, 24)
      // distance badge
      const meters = Math.floor(st.dist / 24)
      ctx.fillStyle = 'rgba(76,29,149,0.9)'
      rr(ctx, W / 2 - 46, 8, 92, 20, 10)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(`${meters} m`, W / 2, 22)
      ctx.font = '10px system-ui'
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillText('ROOFTOP RUN', W / 2, 44)
      // score + coins
      ctx.fillStyle = 'rgba(18,30,49,0.75)'
      rr(ctx, W - 78, 8, 70, 22, 11)
      ctx.fill()
      ctx.font = 'bold 13px system-ui'
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'right'
      ctx.fillText(`${st.score}`, W - 44, 24)
      ctx.font = '12px system-ui'
      ctx.textAlign = 'left'
      ctx.fillText('🪙', W - 72, 24)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#fbbf24'
      ctx.fillText(`${st.coins}`, W - 14, 24)

      // GO! banner
      if (st.goT > 0) {
        ctx.globalAlpha = Math.min(1, st.goT / 16)
        ctx.fillStyle = 'rgba(10,18,48,0.85)'
        rr(ctx, W / 2 - 60, 250, 120, 44, 12)
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 20px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText('GO!', W / 2, 280)
      }
    }

    const onPointerDown = (e) => {
      // ignore taps on the back / mute buttons
      if (e.target && e.target.closest && e.target.closest('button')) return
      e.preventDefault()
      if (st.phase === 'ready') {
        start()
        return
      }
      if (st.phase !== 'play') return
      st.holding = true
      jump()
    }
    const onPointerUp = () => {
      st.holding = false
    }
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        if (st.phase === 'ready') {
          start()
          return
        }
        if (e.type === 'keydown' && !e.repeat) {
          st.holding = true
          jump()
        }
        if (e.type === 'keyup') st.holding = false
      }
    }
    stage.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      stage.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  return (
    <div className="gameview" ref={stageRef}>
      <div className="gamebar">
        <button className="btn icon ghost" onClick={onExit} aria-label="Back">
          ←
        </button>
        <div className="gamebar-title">NimRooftop</div>
        <div className="gamebar-best">best {best}</div>
      </div>
      <div className="stage">
        <canvas ref={canvasRef} className="game" />
        <button
          className="hudbtn"
          aria-label={muted ? 'Unmute' : 'Mute'}
          onClick={() => {
            const m = !muted
            setMuted(m)
            setMutedUI(m)
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        {phase === 'ready' && (
          <div className="overlay">
            <div className="panel">
              <h2>NimRooftop</h2>
              <p className="panel-sub">
                Endless rooftops, one button. TAP to jump — hold it down for a higher jump. Hop the
                pigeons and AC units, leap the gaps, grab the Luna coins.
              </p>
              <p className="panel-hint">TAP to jump · HOLD for a higher jump</p>
              <p className="panel-hint">3 hearts. The city only gets faster.</p>
            </div>
          </div>
        )}
        {phase === 'over' && (
          <div className="overlay">
            <ScoreOverlay
              gameLabel="NimRooftop"
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
