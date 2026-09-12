import { useEffect, useRef, useState } from 'react'
import { drawChicken, drawSun, drawCloud, rr } from '../sketch'
import { sfx, setMuted, isMuted } from '../sound'
import { bestScore, submitScore } from '../leaderboard'
import { getDeviceId } from '../wallet'
import ScoreOverlay from '../components/ScoreOverlay'

const W = 360
const H = 600
const TOWER_CX = 180
const TOWER_HALF = 32
const TOWER_TOP = 84
const TOWER_BOTTOM = 556
const CHICK_START_Y = 100
const SLOT_STEP = 60 // each knife lands 4 cube slots (15px) below the previous one
const SLOT_0 = 128
const MAX_KNIVES = 8
const MAX_LIVES = 3
const HOLD_MS = 280

// fixed knife slots (each 4 cube-slots below the last, cascading left/right)
const SLOTS = Array.from({ length: MAX_KNIVES }, (_, i) => ({
  y: SLOT_0 + i * SLOT_STEP,
  x: TOWER_CX + Math.sin(i * 1.35) * 24,
}))

const QUOTES = [
  'The tower filed a complaint. Too many knives.',
  'One of those knives was aimed at your mustache. All of them were.',
  'The block storm had a seating chart. You were not on it.',
  'Chick: 3 lives. Knife tower: infinite smugness.',
  'Gravity and geometry disagree. Geometry won again.',
]

/** deterministic angle difference in [-PI, PI] */
function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}

function drawTower(ctx, t, mode) {
  const rows = Math.floor((TOWER_BOTTOM - TOWER_TOP) / 28)
  for (let k = 0; k < rows; k++) {
    const y = TOWER_BOTTOM - (k + 1) * 28
    const twist = mode === 'smash' ? Math.sin(t * 0.9 + k * 0.55) * 9 : 0
    const x = TOWER_CX - TOWER_HALF + twist
    // front face
    ctx.fillStyle = mode === 'smash' ? (k % 2 ? '#7e1f3a' : '#1e3a8a') : k % 2 ? '#b45309' : '#c2660d'
    ctx.fillRect(x, y, TOWER_HALF * 2, 27)
    // top edge highlight
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(x, y, TOWER_HALF * 2, 4)
    // side shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(x + TOWER_HALF * 2 - 7, y, 7, 27)
    // up-arrow motif
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    const ax = x + TOWER_HALF
    ctx.beginPath()
    ctx.moveTo(ax, y + 9)
    ctx.lineTo(ax - 6, y + 18)
    ctx.lineTo(ax - 2.4, y + 18)
    ctx.lineTo(ax - 2.4, y + 23)
    ctx.lineTo(ax + 2.4, y + 23)
    ctx.lineTo(ax + 2.4, y + 18)
    ctx.lineTo(ax + 6, y + 18)
    ctx.closePath()
    ctx.fill()
  }
}

function drawKnife(ctx, x, y, side, rot = 0) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  const dir = side // 1 = blade points right, -1 = blade points left
  // blade (steel, with a darker spine for contrast on the tower)
  ctx.fillStyle = '#e8eef4'
  ctx.beginPath()
  ctx.moveTo(dir * 27, 0)
  ctx.lineTo(dir * 5, -5.5)
  ctx.lineTo(dir * 5, 5.5)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(40,55,75,0.55)'
  ctx.lineWidth = 1.2
  ctx.stroke()
  ctx.fillStyle = 'rgba(120,140,165,0.9)'
  ctx.fillRect(dir > 0 ? 5 : -27, -1, 22, 1.6)
  // handle
  ctx.fillStyle = '#8b4513'
  ctx.fillRect(dir * 5 - (dir > 0 ? 12 : 0), -3, 12, 6)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(dir * 5 - (dir > 0 ? 12 : 0), -3, 12, 2)
  ctx.restore()
}

function drawBlock(ctx, x, y, r, t) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(t * 1.4)
  ctx.fillStyle = '#dc2626'
  ctx.fillRect(-r / 2, -r / 2, r, r)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(-r / 2, -r / 2, r, r / 3)
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(-r / 2, -r / 2, r, r)
  ctx.restore()
}

export default function NimKnife({ skin, player, onExit, onScore, requestVerify, walletMode, requestCup }) {
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
  const [best, setBest] = useState(() => bestScore('knife'))
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
      phase: 'ready', // ready | play | flash | over
      t: 0,
      level: 1,
      mode: 'climb',
      lives: MAX_LIVES,
      score: 0,
      lastShown: -1,
      // climb
      chickY: CHICK_START_Y,
      knives: [], // {y, side}
      knocked: [], // {x,y,vy,rot,life}
      // smash
      chickTheta: 0,
      blocks: [], // {th0, r0, v, alive}
      // fx
      popups: [],
      parts: [],
      flights: [], // knives in flight (climb)
      rays: [], // throw flash lines (smash)
      flashT: 0,
      levelT: 0,
      holding: false,
      holdT: 0,
      thrown: 0,
    }

    function levelParams(level) {
      const mode = level % 2 === 1 ? 'climb' : 'smash'
      const k = level - 1
      return {
        mode,
        // climb: chick descent px/s + horizontal sway
        desc: 30 + k * 6,
        swayW: 1.6 + k * 0.12, // rad/s
        swayA: 26 + k * 1.5, // px (kept inside the tower)
        // smash: orbit rad/s, block closure px/s, block count
        orbit: 1.4 + k * 0.15,
        blockV: 16 + level * 2,
        blocksN: 6 + Math.floor((level - 2) / 2),
      }
    }

    function setupLevel(level) {
      const p = levelParams(level)
      st.mode = p.mode
      st.flashT = 90
      st.levelT = 0
      st.flights = []
      st.rays = []
      if (p.mode === 'climb') {
        st.chickY = CHICK_START_Y
        st.knives = []
        st.knocked = []
      } else {
        st.chickTheta = level * 0.9
        const N = p.blocksN
        st.blocks = []
        for (let j = 0; j < N; j++) {
          st.blocks.push({
            th0: (j * Math.PI * 2) / N + level * 0.7,
            r0: 140 + j * 14,
            v: p.blockV,
            alive: true,
          })
        }
      }
    }

    function start() {
      st.t = 0
      st.level = 1
      st.lives = MAX_LIVES
      st.score = 0
      st.lastShown = -1
      st.popups = []
      st.parts = []
      st.thrown = 0
      setupLevel(1)
      st.phase = 'play'
      setPhase('play')
      setScore(0)
      sfx.pop()
    }

    function finish() {
      st.phase = 'over'
      setPhase('over')
      const prevBest = bestScore('knife')
      const isBest = st.score > prevBest
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
      const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      getDeviceId().then((device) => {
        const res = submitScore('knife', {
          id,
          name: playerRef.current || 'Anonymous',
          score: st.score,
          device,
          verified: false,
          ts: Date.now(),
        })
        setEntry({ id, rank: res.rank, isBest })
        setBest(Math.max(prevBest, st.score))
        onScoreRef.current?.('knife', st.score)
      })
      sfx.hit()
    }

    function loseLife(x, y) {
      st.lives -= 1
      sfx.hit()
      st.popups.push({ x, y, text: '-1', life: 50, col: '#e63946' })
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        st.parts.push({ x, y, vx: Math.cos(a) * 2.4, vy: Math.sin(a) * 2.4, life: 30, col: '#ffd166' })
      }
      if (st.lives <= 0) finish()
    }

    function levelClear() {
      st.score += 150
      st.popups.push({ x: TOWER_CX, y: 300, text: 'LEVEL CLEAR +150', life: 70, col: '#22e07f', big: true })
      sfx.win()
      st.level += 1
      setupLevel(st.level)
      st.phase = 'play'
    }

    // a knife lands after a short flight — the hit is judged at landing time
    function landClimbKnife(i) {
      if (st.phase !== 'play') return
      const pL = levelParams(st.level)
      const slot = SLOTS[i]
      const side = slot.x >= TOWER_CX ? -1 : 1
      // blade spans slot.x → toward the tower center (27px); chick body ~22px
      const chickX = TOWER_CX + Math.sin(st.t * pL.swayW) * pL.swayA
      const zone0 = side === -1 ? slot.x - 27 : slot.x - 4
      const zone1 = side === -1 ? slot.x + 4 : slot.x + 27
      const hit =
        st.levelT > 90 && // 1.5s grace at the start of each level
        Math.abs(st.chickY - slot.y) < 16 &&
        chickX + 11 > zone0 &&
        chickX - 11 < zone1
      if (hit) {
        st.knocked.push({ x: slot.x, y: slot.y, vy: -1.6, rot: 0, life: 55 })
        loseLife(chickX, st.chickY - 14)
        return
      }
      st.knives.push({ y: slot.y, side, x: slot.x })
      if (st.knives.length >= MAX_KNIVES) {
        levelClear()
        return
      }
      st.score += 25
      st.popups.push({ x: slot.x + side * 50, y: slot.y - 8, text: '+25', life: 46, col: '#ffb703' })
      sfx.pop()
    }

    function throwNow() {
      if (st.phase !== 'play') return
      if (st.mode === 'climb') {
        const used = st.knives.length + st.flights.length
        if (used >= MAX_KNIVES) return // tower full — the level clear follows
        st.flights.push({ slot: used, t: 0, dur: 10 })
        sfx.flap()
      } else {
        // radial knife from the orbiting chick — shatters the first aligned block
        const lt = st.levelT / 60 // seconds since this level started
        let hitIdx = -1
        let bestR = Infinity
        for (let j = 0; j < st.blocks.length; j++) {
          const b = st.blocks[j]
          if (!b.alive) continue
          const r = b.r0 - b.v * lt
          const th = b.th0 + 0.12 * lt
          if (r < 46 || r > 250) continue
          if (angleDiff(th, st.chickTheta) < 0.32 && r < bestR) {
            bestR = r
            hitIdx = j
          }
        }
        if (hitIdx >= 0) {
          const b = st.blocks[hitIdx]
          const r = b.r0 - b.v * lt
          const th = b.th0 + 0.12 * lt
          const bx = TOWER_CX + Math.cos(th) * r
          const by = 120 + Math.sin(th) * r
          b.alive = false
          st.score += 40
          st.rays.push({
            x0: TOWER_CX + Math.cos(st.chickTheta) * 40,
            y0: 120 + Math.sin(st.chickTheta) * 40,
            x1: bx,
            y1: by,
            life: 14,
          })
          st.popups.push({ x: bx, y: by - 14, text: '+40', life: 46, col: '#4cc9f0' })
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2
            st.parts.push({ x: bx, y: by, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 26, col: '#dc2626' })
          }
          sfx.score()
          if (st.blocks.every((x) => !x.alive)) levelClear()
        } else {
          sfx.drop()
        }
      }
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
      st.t += dt / 60
      const p = levelParams(st.level)

      if (st.phase === 'play') {
        st.levelT += dt
        if (st.mode === 'climb') {
          st.chickY += p.desc * dt / 60
          // held = rapid fire
          if (st.holding) {
            st.holdT -= dt
            if (st.holdT <= 0) {
              throwNow()
              st.holdT = HOLD_MS / (1000 / 60)
            }
          }
          // advance knife flights; the hit is judged at landing
          for (let fi = st.flights.length - 1; fi >= 0; fi--) {
            const f = st.flights[fi]
            f.t += dt
            if (f.t < f.dur) continue
            st.flights.splice(fi, 1)
            landClimbKnife(f.slot)
          }
          for (const k of st.knocked) {
            k.y += k.vy * dt
            k.rot += 0.2 * dt
            k.life -= dt
          }
          st.knocked = st.knocked.filter((k) => k.life > 0)
          if (st.chickY >= 500) levelClear()
        } else {
          st.chickTheta += p.orbit * dt / 60
          if (st.holding) {
            st.holdT -= dt
            if (st.holdT <= 0) {
              throwNow()
              st.holdT = HOLD_MS / (1000 / 60)
            }
          }
          const lt = st.levelT / 60 // seconds since this level started
          for (const b of st.blocks) {
            if (!b.alive) continue
            const r = b.r0 - b.v * lt
            const th = b.th0 + 0.12 * lt
            if (r < 46 && angleDiff(th, st.chickTheta) < 0.5) {
              b.alive = false
              const bx = TOWER_CX + Math.cos(th) * 44
              const by = 120 + Math.sin(th) * 44
              loseLife(bx, by)
              if (st.phase !== 'play') break
            }
          }
          if (st.phase === 'play' && st.blocks.every((x) => !x.alive)) levelClear()
        }
      }

      if (st.flashT > 0) st.flashT -= dt

      for (const pp of st.popups) {
        pp.y -= 0.5 * dt
        pp.life -= dt
      }
      st.popups = st.popups.filter((pp) => pp.life > 0)
      for (const r of st.rays) r.life -= dt
      st.rays = st.rays.filter((r) => r.life > 0)
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

      draw(ctx, st, p)
    }

    function draw(ctx, st, p) {
      const smash = st.mode === 'smash'
      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      if (smash) {
        sky.addColorStop(0, '#0a1230')
        sky.addColorStop(1, '#173a5e')
      } else {
        sky.addColorStop(0, '#7ec8f2')
        sky.addColorStop(0.7, '#bfe6fb')
        sky.addColorStop(1, '#e8f7ff')
      }
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)
      if (smash) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        for (let i = 0; i < 26; i++) {
          const sx = ((i * 137 + 41) % W) + Math.sin(st.t * 0.3 + i) * 2
          const sy = ((i * 211 + 97) % (H - 60)) + 20
          ctx.fillRect(sx, sy, i % 3 ? 1.4 : 2, i % 3 ? 1.4 : 2)
        }
      } else {
        drawSun(ctx, 300, 80, 20)
        drawCloud(ctx, 60 + Math.sin(st.t * 0.4) * 8, 130, 0.7)
        drawCloud(ctx, 260 + Math.sin(st.t * 0.3 + 2) * 8, 300, 0.55)
        // distant buildings
        ctx.fillStyle = 'rgba(120,150,175,0.5)'
        ctx.fillRect(24, 330, 52, 226)
        ctx.fillRect(290, 360, 54, 196)
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        for (let wy = 344; wy < 540; wy += 26) {
          ctx.fillRect(32, wy, 36, 10)
          ctx.fillRect(298, wy - 14, 38, 10)
        }
      }

      drawTower(ctx, st.t, st.mode)

      // stuck knives (climb)
      for (const k of st.knives) drawKnife(ctx, k.x, k.y, k.side)
      // in-flight knives rising to their slot (climb)
      for (const f of st.flights) {
        const slot = SLOTS[f.slot]
        const k = f.t / f.dur
        const fy = H - 16 + (slot.y - (H - 16)) * k
        drawKnife(ctx, slot.x, fy, 1, -Math.PI / 2)
      }
      // knocked knives
      for (const k of st.knocked) drawKnife(ctx, k.x, k.y, 1, k.rot)
      // throw flash lines (smash)
      for (const r of st.rays) {
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'
        ctx.lineWidth = 3
        ctx.globalAlpha = Math.min(1, r.life / 14)
        ctx.beginPath()
        ctx.moveTo(r.x0, r.y0)
        ctx.lineTo(r.x1, r.y1)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // blocks (smash)
      if (st.mode === 'smash') {
        const lt = st.levelT / 60 // seconds since this level started
        for (const b of st.blocks) {
          if (!b.alive) continue
          const r = b.r0 - b.v * lt
          if (r < 14) continue
          const th = b.th0 + 0.12 * lt
          const bx = TOWER_CX + Math.cos(th) * r
          const by = 120 + Math.sin(th) * r
          drawBlock(ctx, bx, by, 17, st.t + b.th0)
        }
      }

      // chick
      if (st.mode === 'climb') {
        const cx = TOWER_CX + Math.sin(st.t * p.swayW) * p.swayA
        drawChicken(ctx, cx, st.chickY, 1.0, skinRef.current, st.t, st.t * 12, Math.cos(st.t * p.swayW) * 0.1)
      } else {
        const cx = TOWER_CX + Math.cos(st.chickTheta) * 40
        const cy = 120 + Math.sin(st.chickTheta) * 40
        drawChicken(ctx, cx, cy, 0.95, skinRef.current, st.t, st.t * 12, Math.sin(st.t * 2) * 0.12)
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
        ctx.font = pp.big ? 'bold 17px system-ui' : 'bold 15px system-ui'
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
      // hearts
      ctx.font = '15px system-ui'
      ctx.textAlign = 'left'
      let hearts = ''
      for (let i = 0; i < MAX_LIVES; i++) hearts += i < st.lives ? '❤️' : '🖤'
      ctx.fillStyle = 'rgba(18,30,49,0.75)'
      rr(ctx, 8, 8, 66, 22, 11)
      ctx.fill()
      ctx.fillText(hearts, 14, 24)
      // level badge + progress
      const prog =
        st.mode === 'climb'
          ? Math.min(1, (st.chickY - CHICK_START_Y) / (500 - CHICK_START_Y))
          : st.blocks.length
            ? st.blocks.filter((b) => !b.alive).length / st.blocks.length
            : 1
      ctx.fillStyle = 'rgba(76,29,149,0.9)'
      rr(ctx, TOWER_CX - 46, 8, 92, 20, 10)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(`Level ${st.level}`, TOWER_CX, 22)
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      rr(ctx, TOWER_CX - 40, 31, 80, 5, 2.5)
      ctx.fill()
      ctx.fillStyle = '#22e07f'
      rr(ctx, TOWER_CX - 40, 31, 80 * (st.mode === 'smash' ? 1 - prog : prog), 5, 2.5)
      ctx.fill()
      // coins
      ctx.fillStyle = 'rgba(18,30,49,0.75)'
      rr(ctx, W - 74, 8, 66, 22, 11)
      ctx.fill()
      ctx.font = '13px system-ui'
      ctx.textAlign = 'left'
      ctx.fillText(`🪙 ${Math.floor(st.score / 40)}`, W - 66, 24)
      // mode label
      ctx.font = '10px system-ui'
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillText(st.mode === 'climb' ? 'KNIFE CLIMB' : 'BLOCK SMASH', TOWER_CX, 48)

      // level flash banner (also a "get ready" grace on level 1)
      if (st.flashT > 0) {
        ctx.globalAlpha = Math.min(1, st.flashT / 20)
        ctx.fillStyle = 'rgba(10,18,48,0.85)'
        rr(ctx, TOWER_CX - 86, 260, 172, 54, 12)
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 15px system-ui'
        ctx.fillText(st.level === 1 ? 'LEVEL 1' : `LEVEL ${st.level}`, TOWER_CX, 279)
        ctx.font = '11px system-ui'
        ctx.fillStyle = '#9ec5ff'
        ctx.fillText(
          st.mode === 'climb'
            ? st.level === 1
              ? 'throw when the chick is clear'
              : 'climb — don’t knife the chick'
            : 'smash every block',
          TOWER_CX,
          294
        )
        ctx.fillText(st.level === 1 ? 'GET READY…' : 'GO!', TOWER_CX, 308)
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
      st.holdT = 0
      throwNow()
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
          st.holdT = 0
          throwNow()
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
        <div className="gamebar-title">NimKnife</div>
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
              <h2>NimKnife</h2>
              <p className="panel-sub">
                The chick rides down the knife tower. Stick knives four slots below the last one —
                never into the chick. Then the block storm: the chick spins on top, smash every cube
                before it hits her.
              </p>
              <p className="panel-hint">TAP or SPACE to throw · HOLD for rapid fire</p>
              <p className="panel-hint">Each level gets faster. 3 hearts. 100% skill.</p>
            </div>
          </div>
        )}
        {phase === 'over' && (
          <div className="overlay">
            <ScoreOverlay
              gameLabel="NimKnife"
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
