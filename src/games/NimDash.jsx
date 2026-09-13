import { useEffect, useRef, useState } from 'react'
import { drawChicken, drawFly, drawSun, drawCloud, rr } from '../sketch'
import { sfx, setMuted, isMuted } from '../sound'
import { bestScore, submitScore } from '../leaderboard'
import { getDeviceId } from '../wallet'
import ScoreOverlay from '../components/ScoreOverlay'

const W = 360
const H = 600
const CHICK_X = 80
const HW = 13 // half width
const HH = 12 // half height
const GROUND_Y = 470
const G = 0.5
const JUMP_V = -11
const FLAP_V = -8
const BASE_SPEED = 3.6
const MAX_BONUS = 2.4
const SEED = 7

const QUOTES = [
  'The mustache union demands a rematch.',
  'You flapped. The flies respected it.',
  'Luna coins don’t collect themselves. You proved it.',
  'The pits were not a suggestion.',
  'Great run. The grass remembers your feet.',
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

function drawBlockUnit(ctx, x, y, w, h) {
  ctx.fillStyle = '#d99a2b'
  rr(ctx, x, y, w, h, 4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,70,10,0.55)'
  ctx.lineWidth = 2
  rr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 3)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(x + 4, y + 3, w - 8, 3)
  // rivets
  ctx.fillStyle = 'rgba(120,70,10,0.5)'
  ctx.fillRect(x + 5, y + 5, 3, 3)
  ctx.fillRect(x + w - 8, y + 5, 3, 3)
  ctx.fillRect(x + 5, y + h - 8, 3, 3)
  ctx.fillRect(x + w - 8, y + h - 8, 3, 3)
}

function drawLuna(ctx, x, y, t) {
  ctx.save()
  ctx.translate(x, y)
  const sq = 0.82 + 0.18 * Math.abs(Math.sin(t * 0.08 + x * 0.05))
  ctx.scale(sq, 1)
  ctx.fillStyle = '#fde68a'
  ctx.beginPath()
  ctx.arc(0, 0, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#d97706'
  ctx.lineWidth = 1.6
  ctx.stroke()
  ctx.fillStyle = '#b45309'
  ctx.beginPath()
  ctx.arc(-1, 0, 5.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fde68a'
  ctx.beginPath()
  ctx.arc(1.4, -1.6, 4.8, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export default function NimDash({ skin, player, onExit, onScore, requestVerify, walletMode, requestCup }) {
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
  const [best, setBest] = useState(() => bestScore('dash'))
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
      phase: 'ready', // ready | play | dying | over
      f: 0,
      dist: 0,
      speed: BASE_SPEED,
      timeScale: 1,
      chickY: GROUND_Y - HH,
      vy: 0,
      onGround: true,
      holding: false,
      flapsUsed: 0,
      rot: 0,
      rotV: 0,
      squashT: 0,
      invuln: 0,
      lives: 3,
      coins: 0,
      stompBonus: 0,
      score: 0,
      lastShown: -1,
      // world
      rng: mulberry32(SEED),
      segs: [],
      objects: [],
      genX: 0,
      dieT: 0,
      // fx
      shakeT: 0,
      shakeMag: 0,
      flashT: 0,
      flashCol: '255,255,255',
      popups: [],
      parts: [],
      goT: 0,
    }

    function addObj(o) {
      st.objects.push(o)
    }

    function genSegment(prevX) {
      const r = st.rng
      let gap = 0
      // calm intro stretch — no pits for the first ~600px
      if (prevX > 600 && r() < 0.5) gap = 58 + r() * (38 + Math.min(56, st.dist / 42))
      // a pit is always followed by a long landing runway
      const segW = gap > 0 ? 200 + r() * 130 : 150 + r() * 180
      const x0 = prevX + gap
      const x1 = x0 + segW
      st.segs.push({ x0, x1 })
      // coin arc over the pit we just left
      if (gap > 0) {
        const g0 = x0 - gap
        for (let i = 0; i < 5; i++) {
          const k = i / 4
          addObj({ type: 'coin', x: g0 + gap * k, y: GROUND_Y - 40 - Math.sin(k * Math.PI) * 62, taken: false })
        }
      }
      // obstacles (never on the opening stretch, never right at a pit edge)
      if (x0 > 520 && gap === 0) {
        let n = segW > 230 ? (r() < 0.6 ? 2 : 1) : r() < 0.5 ? 1 : 0
        let tries = 0
        while (n > 0 && tries < 10) {
          tries++
          const type = r() < 0.42 ? 'fly' : r() < 0.5 ? 'block' : 'tall'
          const ox = x0 + 60 + r() * (segW - 120)
          // coins never block obstacle placement — only other obstacles do
          if (st.objects.every((o) => o.type === 'coin' || Math.abs(o.x - ox) > 130)) {
            if (type === 'fly') addObj({ type: 'fly', x: ox, y: GROUND_Y - 42, w: 26, h: 20, bob: r() * 6.28, squished: 0 })
            else if (type === 'block') addObj({ type: 'block', x: ox, y: GROUND_Y - 34, w: 34, h: 34 })
            else addObj({ type: 'tall', x: ox, y: GROUND_Y - 66, w: 34, h: 66 })
            n--
          }
        }
        // coin row on long clean segments
        if (segW > 200 && r() < 0.7) {
          const sx = x0 + 70 + r() * (segW - 160)
          for (let i = 0; i < 4; i++) addObj({ type: 'coin', x: sx + i * 26, y: GROUND_Y - 64, taken: false })
        }
      }
      return x1
    }

    function ensureWorld() {
      let guard = 0
      while (st.genX < st.dist + W + 320 && guard++ < 60) {
        st.genX = genSegment(st.genX)
      }
      while (st.segs.length && st.segs[0].x1 < st.dist - 300) st.segs.shift()
      // only cull what is behind — the ahead-window must stay wider than the
      // generation lookahead or fresh objects get pruned the frame they spawn
      st.objects = st.objects.filter((o) => o.x > st.dist - 120)
    }

    function start() {
      st.f = 0
      st.dist = 0
      st.speed = BASE_SPEED
      st.timeScale = 1
      st.vy = 0
      st.chickY = GROUND_Y - HH
      st.onGround = true
      st.holding = false
      st.flapsUsed = 0
      st.rot = 0
      st.rotV = 0
      st.squashT = 0
      st.invuln = 60
      st.lives = 3
      st.coins = 0
      st.stompBonus = 0
      st.score = 0
      st.lastShown = -1
      st.rng = mulberry32(SEED)
      st.segs = []
      st.objects = []
      st.genX = 0
      st.genX = genSegment(0)
      st.popups = []
      st.parts = []
      st.shakeT = 0
      st.flashT = 0
      st.goT = 50
      st.phase = 'play'
      setPhase('play')
      setScore(0)
      sfx.pop()
    }

    function finish() {
      st.phase = 'over'
      setPhase('over')
      const prevBest = bestScore('dash')
      const isBest = st.score > prevBest
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
      const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      getDeviceId().then((device) => {
        const res = submitScore('dash', {
          id,
          name: playerRef.current || 'Anonymous',
          score: st.score,
          device,
          verified: false,
          ts: Date.now(),
        })
        setEntry({ id, rank: res.rank, isBest })
        setBest(Math.max(prevBest, st.score))
        onScoreRef.current?.('dash', st.score)
      })
      sfx.hit()
    }

    function addShake(mag, frames) {
      st.shakeMag = Math.max(st.shakeMag, mag)
      st.shakeT = Math.max(st.shakeT, frames)
    }
    function addFlash(col, frames) {
      st.flashCol = col
      st.flashT = Math.max(st.flashT, frames)
    }
    function burst(x, y, col, n, spd) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        st.parts.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 0.6, life: 26, col })
      }
    }

    function doJump() {
      if (st.onGround) {
        st.vy = JUMP_V
        st.onGround = false
        st.flapsUsed = 0
        sfx.flap()
        for (let i = 0; i < 6; i++)
          st.parts.push({ x: CHICK_X - 6, y: GROUND_Y - 2, vx: -1 - Math.random() * 1.5, vy: -Math.random() * 1, life: 16, col: 'rgba(255,255,255,0.85)' })
      } else if (st.flapsUsed === 0) {
        st.vy = FLAP_V
        st.flapsUsed = 1
        sfx.flap()
        burst(CHICK_X, st.chickY + 8, 'rgba(255,255,255,0.9)', 8, 1.6)
      }
    }

    function startDying() {
      st.phase = 'dying'
      st.dieT = 52
      st.timeScale = 0.3
      st.rotV = 0.22
      addShake(7, 30)
      addFlash('226,57,70', 16)
    }

    function loseLife(fell) {
      st.lives -= 1
      st.invuln = 90
      sfx.hit()
      st.popups.push({ x: fell ? CHICK_X : CHICK_X, y: (fell ? 140 : st.chickY - 26), text: '-1', life: 46, col: '#e63946', big: true })
      addFlash('226,57,70', 12)
      addShake(5, 20)
      if (st.lives <= 0) {
        startDying()
        return
      }
      if (fell) respawn()
    }

    function respawn() {
      let target = null
      let guard = 0
      while (!target && guard++ < 50) {
        ensureWorld()
        target = st.segs.find((s) => s.x1 > st.dist + CHICK_X + 60)
      }
      st.dist = target.x0 + 46 - CHICK_X
      st.chickY = GROUND_Y - HH
      st.vy = 0
      st.onGround = true
      st.invuln = 110
      addFlash('255,255,255', 8)
      burst(CHICK_X, GROUND_Y - 10, 'rgba(255,255,255,0.9)', 10, 2)
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
      let dt = ((now - last) / (1000 / 60)) * st.timeScale
      last = now
      if (dt > 3) dt = 3
      st.f += dt

      if (st.phase === 'play') {
        st.speed = BASE_SPEED + Math.min(MAX_BONUS, st.f * 0.0016)
        st.dist += st.speed * dt
        if (st.goT > 0) st.goT -= dt
        if (st.invuln > 0) st.invuln -= dt
        ensureWorld()

        const wx = st.dist + CHICK_X
        let seg = null
        for (const s of st.segs) {
          if (wx >= s.x0 && wx <= s.x1) {
            seg = s
            break
          }
        }
        const groundY = seg ? GROUND_Y : Infinity

        // physics
        const g = st.holding && st.vy < 0 ? 0.32 : G
        const prevY = st.chickY
        st.vy += g * dt
        st.chickY += st.vy * dt
        // only land if we crossed the ground plane this frame — a chick that is
        // already well below the ground top (i.e. in a pit) keeps falling
        if (st.vy >= 0 && st.chickY >= groundY - HH && prevY <= groundY - HH + 20) {
          if (!st.onGround) {
            st.squashT = 6
            for (let i = 0; i < 4; i++)
              st.parts.push({ x: CHICK_X - 4, y: GROUND_Y - 2, vx: -0.8 - Math.random(), vy: -Math.random() * 0.6, life: 14, col: 'rgba(255,255,255,0.75)' })
          }
          st.chickY = groundY - HH
          st.vy = 0
          st.onGround = true
          st.flapsUsed = 0
        }
        if (st.onGround && seg === null) st.onGround = false
        if (st.squashT > 0) st.squashT -= dt

        // fell into a pit: off the bottom of the screen, or clipped below the
        // ground top while over a ground segment (failed to clear the pit)
        if (st.chickY > H + 40 || (seg !== null && st.chickY > GROUND_Y)) {
          loseLife(true)
          if (st.phase !== 'play') {
            stepFx(dt)
            draw(ctx, st)
            return
          }
        }

        // object interactions
        const cL = CHICK_X - HW + 3
        const cR = CHICK_X + HW - 3
        const cT = st.chickY - HH + 3
        const cB = st.chickY + HH - 3
        for (const o of st.objects) {
          const sx = o.x - st.dist
          if (sx < -60 || sx > W + 60) continue
          if (o.type === 'coin') {
            if (!o.taken && Math.abs(sx - CHICK_X) < 20 && Math.abs(o.y - st.chickY) < 24) {
              o.taken = true
              st.coins += 1
              sfx.pop()
              burst(sx, o.y, '#fbbf24', 6, 1.8)
            }
          } else if (o.type === 'fly') {
            if (o.squished > 0) {
              o.squished -= dt
              continue
            }
            const fy = o.y + Math.sin(st.f * 0.12 + o.bob) * 5
            const oT = fy - o.h / 2 + 3
            const oB = fy + o.h / 2 - 3
            const oL = sx - o.w / 2 + 3
            const oR = sx + o.w / 2 - 3
            if (oL < cR && oR > cL && oT < cB && oB > cT) {
              if (st.vy > 0 && cB - oT < 14) {
                // stomp
                o.squished = 26
                st.stompBonus += 50
                st.vy = -8
                sfx.score()
                addFlash('255,255,255', 6)
                addShake(3, 10)
                st.popups.push({ x: sx, y: fy - 20, text: '+50', life: 44, col: '#4cc9f0' })
                burst(sx, fy, '#9aa5b1', 9, 2)
              } else if (st.invuln <= 0) {
                loseLife(false)
                if (st.phase !== 'play') break
              }
            }
          } else {
            // block / tall
            const oL = sx + 4
            const oR = sx + o.w - 4
            const oT = o.y + 4
            const oB = o.y + o.h - 2
            if (oL < cR && oR > cL && oT < cB && oB > cT && st.invuln <= 0) {
              loseLife(false)
              if (st.phase !== 'play') break
            }
          }
        }

        st.score = Math.floor(st.dist / 24) + st.coins * 10 + st.stompBonus
      } else if (st.phase === 'dying') {
        st.vy += G * dt
        st.chickY += st.vy * dt
        st.rot += st.rotV * dt
        st.dieT -= dt
        if (st.dieT <= 0) finish()
      }

      stepFx(dt)

      if (st.score !== st.lastShown) {
        st.lastShown = st.score
        setScore(st.score)
      }

      draw(ctx, st)
    }

    function stepFx(dt) {
      if (st.shakeT > 0) {
        st.shakeT -= dt
        if (st.shakeT <= 0) st.shakeMag = 0
      }
      if (st.flashT > 0) st.flashT -= dt
      for (const pp of st.popups) {
        pp.y -= 0.5 * dt
        pp.life -= dt
      }
      st.popups = st.popups.filter((pp) => pp.life > 0)
      for (const pt of st.parts) {
        pt.x += pt.vx * dt
        pt.y += pt.vy * dt
        pt.vy += 0.12 * dt
        pt.life -= dt
      }
      st.parts = st.parts.filter((pt) => pt.life > 0)
    }

    function draw(ctx, st) {
      ctx.save()
      if (st.shakeT > 0) {
        const m = st.shakeMag * (st.shakeT / 20)
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m)
      }

      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#6ec6f0')
      sky.addColorStop(0.7, '#bfe6fb')
      sky.addColorStop(1, '#e8f7ff')
      ctx.fillStyle = sky
      ctx.fillRect(-8, -8, W + 16, H + 16)
      drawSun(ctx, 300, 74, 20)
      for (let i = 0; i < 3; i++) {
        const cx = ((((i * 200 + 40 - st.dist * 0.15) % (W + 160)) + W + 160) % (W + 160)) - 80
        drawCloud(ctx, cx, 60 + i * 44, 0.5 + (i % 2) * 0.2)
      }
      // far skyline
      const farOff = (st.dist * 0.3) % 170
      const farCol0 = Math.floor(((st.dist * 0.3 - 170) / 170))
      ctx.fillStyle = 'rgba(120,150,175,0.45)'
      for (let x = -farOff - 170; x < W + 170; x += 170) {
        const idx = farCol0 + Math.round((x + farOff) / 170)
        const bh = 90 + ((idx * 53) % 120)
        ctx.fillRect(x + 24, GROUND_Y - bh, 104, bh)
      }

      // ground segments
      for (const s of st.segs) {
        const x0 = s.x0 - st.dist
        const x1 = s.x1 - st.dist
        if (x1 < -30 || x0 > W + 30) continue
        // dirt
        ctx.fillStyle = '#7c4a21'
        ctx.fillRect(x0, GROUND_Y, x1 - x0, H - GROUND_Y)
        // grass top
        ctx.fillStyle = '#4caf50'
        ctx.fillRect(x0, GROUND_Y, x1 - x0, 12)
        ctx.fillStyle = 'rgba(255,255,255,0.28)'
        ctx.fillRect(x0, GROUND_Y, x1 - x0, 3)
        // grass tufts
        ctx.fillStyle = '#3d8b40'
        for (let gx = x0 + 8; gx < x1 - 6; gx += 22) ctx.fillRect(gx, GROUND_Y - 3, 6, 5)
        // dirt speckles
        ctx.fillStyle = 'rgba(0,0,0,0.14)'
        for (let gy = GROUND_Y + 26; gy < H - 8; gy += 34)
          for (let gx = x0 + 12; gx < x1 - 10; gx += 40) ctx.fillRect(gx, gy, 10, 6)
      }
      // pit shadow (below, where there is no ground)
      const chasm = ctx.createLinearGradient(0, GROUND_Y, 0, H)
      chasm.addColorStop(0, 'rgba(15,23,42,0.0)')
      chasm.addColorStop(1, 'rgba(2,6,23,0.5)')
      ctx.fillStyle = chasm
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)

      // objects
      for (const o of st.objects) {
        const sx = o.x - st.dist
        if (sx < -60 || sx > W + 60) continue
        if (o.type === 'coin') {
          if (!o.taken) drawLuna(ctx, sx, o.y, st.f)
        } else if (o.type === 'fly') {
          if (o.squished > 0) {
            const k = o.squished / 26
            ctx.save()
            ctx.translate(sx, o.y + 6)
            ctx.scale(1 + (1 - k) * 0.5, k * 0.5 + 0.1)
            ctx.globalAlpha = k
            drawFly(ctx, 0, 0, 1, st.f, false)
            ctx.restore()
            ctx.globalAlpha = 1
          } else {
            const fy = o.y + Math.sin(st.f * 0.12 + o.bob) * 5
            drawFly(ctx, sx, fy, 1, st.f, false)
          }
        } else {
          drawBlockUnit(ctx, sx, o.y, o.w, o.h)
        }
      }

      // chick
      const blink = st.invuln > 0 && Math.floor(st.f / 4) % 2 === 0
      if (!blink) {
        let s = 1
        if (st.phase === 'dying') s = 1
        else if (st.squashT > 0) s = 0.82
        else if (st.onGround) s = 1 + Math.sin(st.f * 0.9) * 0.03
        else if (st.vy < -2) s = 1.12
        const flap = st.onGround ? Math.sin(st.f * 0.9) * 0.5 : 3
        const rot = st.phase === 'dying' ? st.rot : clamp(st.vy * 0.02, -0.28, 0.35)
        drawChicken(ctx, CHICK_X, st.chickY, s, skinRef.current, st.f / 60, flap, rot)
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
        ctx.font = pp.big ? 'bold 18px system-ui' : 'bold 15px system-ui'
        ctx.textAlign = 'center'
        ctx.fillStyle = pp.col
        ctx.globalAlpha = Math.min(1, pp.life / 20)
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'
        ctx.lineWidth = 3
        ctx.strokeText(pp.text, pp.x, pp.y)
        ctx.fillText(pp.text, pp.x, pp.y)
      }
      ctx.globalAlpha = 1

      // hit/death flash
      if (st.flashT > 0) {
        ctx.fillStyle = `rgba(${st.flashCol},${Math.min(0.5, st.flashT / 24)})`
        ctx.fillRect(-8, -8, W + 16, H + 16)
      }
      if (st.phase === 'dying') {
        ctx.fillStyle = 'rgba(2,6,23,0.28)'
        ctx.fillRect(-8, -8, W + 16, H + 16)
      }
      ctx.restore()

      // ---------- HUD (kept clear of each other) ----------
      // hearts (top-left)
      ctx.font = '15px system-ui'
      ctx.textAlign = 'left'
      let hearts = ''
      for (let i = 0; i < 3; i++) hearts += i < st.lives ? '❤️' : '🖤'
      ctx.fillStyle = 'rgba(18,30,49,0.72)'
      rr(ctx, 8, 8, 66, 22, 11)
      ctx.fill()
      ctx.fillText(hearts, 14, 24)
      // distance badge (top-center)
      const meters = Math.floor(st.dist / 24)
      ctx.fillStyle = 'rgba(76,29,149,0.9)'
      rr(ctx, W / 2 - 44, 8, 88, 20, 10)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(`${meters} m`, W / 2, 22)
      ctx.font = '9px system-ui'
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.fillText('NIM DASH', W / 2, 38)
      // score + coins (top-right, one pill, spaced)
      ctx.fillStyle = 'rgba(18,30,49,0.72)'
      rr(ctx, W - 128, 8, 120, 22, 11)
      ctx.fill()
      ctx.textAlign = 'left'
      ctx.font = '12px system-ui'
      ctx.fillStyle = '#fbbf24'
      ctx.fillText(`🪙${st.coins}`, W - 120, 24)
      ctx.textAlign = 'right'
      ctx.font = 'bold 14px system-ui'
      ctx.fillStyle = '#fff'
      ctx.fillText(`${st.score}`, W - 16, 24)

      // GO! banner
      if (st.goT > 0) {
        ctx.globalAlpha = Math.min(1, st.goT / 14)
        ctx.fillStyle = 'rgba(10,18,48,0.85)'
        rr(ctx, W / 2 - 58, 240, 116, 44, 12)
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 20px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText('GO!', W / 2, 270)
      }
    }

    const onPointerDown = (e) => {
      if (e.target && e.target.closest && e.target.closest('button')) return
      e.preventDefault()
      if (st.phase === 'ready') {
        start()
        return
      }
      if (st.phase !== 'play') return
      st.holding = true
      doJump()
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
          doJump()
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
        <div className="gamebar-title">NimDash</div>
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
              <h2>NimDash</h2>
              <p className="panel-sub">
                A mustached chicken sprints across the city. TAP to jump the blocks &amp; pits — and
                TAP again mid-air to FLAP your wings once. Land on top of the flies to stomp them for
                +50, and grab the Luna coins.
              </p>
              <p className="panel-hint">TAP to jump · TAP mid-air to flap (once)</p>
              <p className="panel-hint">Stomp flies for +50. 3 hearts. 100% skill.</p>
            </div>
          </div>
        )}
        {phase === 'over' && (
          <div className="overlay">
            <ScoreOverlay
              gameLabel="NimDash"
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
