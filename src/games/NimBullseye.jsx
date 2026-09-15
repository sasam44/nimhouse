import { useEffect, useRef, useState } from 'react'
import { drawDart, drawSun, drawCloud, rr } from '../sketch'
import { sfx } from '../sound'
import { bestScore, submitScore } from '../leaderboard'
import { getDeviceId } from '../wallet'
import ScoreOverlay from '../components/ScoreOverlay'

const W = 360
const H = 600
const CX = 180
const CY = 232
const R = 118
const DARTS_PER_LEVEL = 5
const SWEET = 72 // ideal power (green band center)
const SWEET_W = 6 // green band half-width
const RETICLE_LIFT = 110 // touch: crosshair floats this far above the fingertip (finger occlusion)

// Classic dartboard geometry (rings widened a bit so they are aimable by
// touch): inner bull 50, outer bull 25, triple ring = 3×, double ring = 2×.
const BULL_IN = 10
const BULL_OUT = 22
const TRIPLE_IN = 56
const TRIPLE_OUT = 78
const DOUBLE_IN = 96 // double ring runs DOUBLE_IN..R

// Classic 20-segment layout, numbers clockwise from the top (20 at 12 o'clock)
const SEGS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
const BLACK_SEGS = new Set([20, 4, 13, 15, 3, 7, 8, 14, 12, 5])

const DART_SCALE = 1.15
const TIP_LEN = 24 * DART_SCALE // tip offset inside drawDart local coords

/** Score a dart landing at (ox, oy) relative to the board center.
 *  20 segments × 18°; segment 20 is centered at the top (-90°). */
function dartHit(ox, oy) {
  const d = Math.hypot(ox, oy)
  if (d <= BULL_IN) return { pts: 50, name: 'BULL' }
  if (d <= BULL_OUT) return { pts: 25, name: '25' }
  if (d > R) return { pts: 0, name: 'MISS' }
  const a = (Math.atan2(oy, ox) * 180) / Math.PI
  const rel = (((a + 99) % 360) + 360) % 360 // 0 at the 20 segment's leading edge
  const idx = Math.floor(rel / 18) % 20
  const num = SEGS[idx]
  if (d >= TRIPLE_IN && d <= TRIPLE_OUT) return { pts: num * 3, name: 'T' + num }
  if (d >= DOUBLE_IN) return { pts: num * 2, name: 'D' + num }
  return { pts: num, name: String(num) }
}

/**
 * Five levels of increasing difficulty. The crosshair sways around the home
 * point; from level 3 the board itself starts drifting (Lissajous motion).
 * Purely deterministic — same level always behaves the same.
 */
const LEVELS = [
  { swayX: 58, swayY: 32, swaySp: 1.25, boardAx: 0, boardAy: 0, boardSp: 0, label: 'WARM-UP' },
  { swayX: 68, swayY: 38, swaySp: 1.7, boardAx: 0, boardAy: 0, boardSp: 0, label: 'FAST SWAY' },
  { swayX: 64, swayY: 36, swaySp: 1.55, boardAx: 46, boardAy: 20, boardSp: 0.55, label: 'MOVING BOARD' },
  { swayX: 72, swayY: 42, swaySp: 2.0, boardAx: 66, boardAy: 32, boardSp: 0.8, label: 'WIBBLY BOARD' },
  { swayX: 80, swayY: 46, swaySp: 2.45, boardAx: 78, boardAy: 40, boardSp: 1.05, label: 'CHAOS BOARD' },
]

const QUOTES = [
  'Five boards, twenty-five darts. The wall is full of opinions.',
  'The chaos board sends its regards.',
  'Sharpshooter material, eventually.',
  'Your arm had opinions today.',
  'The sway won that one. The drift won this one.',
]



export default function NimBullseye({ skin, player, onExit, onScore, requestVerify, walletMode, requestCup }) {
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
  const [best, setBest] = useState(() => bestScore('bull'))
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
      phase: 'ready', // ready | playing | over
      t: 0,
      level: 0,
      darts: DARTS_PER_LEVEL,
      thrown: [], // { ox, oy, pts, perfect } — offsets from the board center
      charging: false,
      chargeStart: 0,
      power: 0,
      pointer: null, // {x, y, touch} — raw input position (canvas coords)
      pressWall: 0, // wall-clock ms when the current press started
      moved: 0, // accumulated aim movement during the current press
      lastP: null,
      fly: null,
      total: 0,
      float: null,
      banner: null, // { text, sub, t }
      levelPause: 0,
    }

    function boardPos(t, lv) {
      const L = LEVELS[lv]
      return {
        x: CX + Math.sin(t * L.boardSp) * L.boardAx,
        y: CY + Math.sin(t * L.boardSp * 1.3 + 1.7) * L.boardAy,
      }
    }

    function aimPos(t, lv) {
      // The crosshair is your aim. For touch it floats RETICLE_LIFT px above
      // the fingertip so it stays visible (a finger covers its own touch
      // point); for mouse it sits exactly under the cursor. The legacy sway
      // is only a fallback for pointer-less (keyboard) sessions.
      if (st.pointer) {
        const y = st.pointer.touch ? st.pointer.y - RETICLE_LIFT : st.pointer.y
        return { x: st.pointer.x, y: Math.min(H - 4, Math.max(4, y)) }
      }
      const L = LEVELS[lv]
      return {
        x: CX + Math.sin(t * L.swaySp) * L.swayX,
        y: CY + Math.sin(t * L.swaySp * 1.55 + 0.8) * L.swayY,
      }
    }

    function start() {
      st.phase = 'playing'
      setPhase('playing')
    }

    function finish() {
      st.phase = 'over'
      setPhase('over')
      const prevBest = bestScore('bull')
      const isBest = st.total > prevBest
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
      const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      getDeviceId().then((device) => {
        const res = submitScore('bull', {
          id,
          name: playerRef.current || 'Anonymous',
          score: st.total,
          device,
          verified: false,
          ts: Date.now(),
        })
        setEntry({ id, rank: res.rank, isBest })
        setBest(Math.max(prevBest, st.total))
        onScoreRef.current?.('bull', st.total)
      })
    }

    function nextLevel() {
      st.level += 1
      st.darts = DARTS_PER_LEVEL
      st.thrown = []
      const L = LEVELS[st.level]
      st.banner = { text: `LEVEL ${st.level + 1}`, sub: L.label, t: 0 }
      st.levelPause = 45
      sfx.win()
    }

    function press() {
      if (st.phase === 'ready') {
        start()
        return
      }
      if (st.phase === 'playing' && !st.fly && st.levelPause <= 0) {
        st.charging = true
        st.chargeStart = st.t
        st.pressWall = performance.now()
        st.moved = 0
      }
    }

    function release() {
      if (st.phase !== 'playing' || !st.charging || st.fly) return
      const held = performance.now() - st.pressWall
      st.charging = false
      // Quick tap (< 200 ms, barely moved) = aim only: it places the
      // crosshair without throwing a dart.
      if (held < 200 && st.moved < 12) return
      const p = 100 * (0.5 - 0.5 * Math.cos((st.t - st.chargeStart) * 5.2))
      st.power = p
      // No hidden drift: the dart lands exactly where the crosshair is.
      // Power only decides the PERFECT 2× bonus (green band).
      const perfect = p >= SWEET - SWEET_W && p <= SWEET + SWEET_W
      const a = aimPos(st.t, st.level)
      const b = boardPos(st.t, st.level)
      st.fly = {
        t: 0,
        fromX: CX,
        fromY: H + 60,
        toX: a.x,
        toY: a.y,
        ox: a.x - b.x,
        oy: a.y - b.y,
        perfect,
      }
      sfx.pop()
    }

    controls.current.replay = () => {
      st.phase = 'ready'
      st.t = 0
      st.level = 0
      st.darts = DARTS_PER_LEVEL
      st.thrown = []
      st.charging = false
      st.power = 0
      st.fly = null
      st.total = 0
      st.float = null
      st.banner = null
      st.levelPause = 0
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

      if (st.levelPause > 0) st.levelPause -= dt
      if (st.charging) {
        st.power = 100 * (0.5 - 0.5 * Math.cos((st.t - st.chargeStart) * 5.2))
      }

      if (st.fly) {
        st.fly.t += dt / 18
        if (st.fly.t >= 1) {
          const x = st.fly.toX
          const y = st.fly.toY
          const hit = dartHit(st.fly.ox, st.fly.oy)
          const perfect = st.fly.perfect
          const pts = perfect ? hit.pts * 2 : hit.pts
          const tag = hit.name === 'BULL' || hit.name[0] === 'T' || hit.name[0] === 'D' ? hit.name : ''
          st.thrown.push({ ox: st.fly.ox, oy: st.fly.oy, pts, perfect })
          st.total += pts
          st.darts -= 1
          st.float = { x, y, pts, perfect, tag, t: 0 }
          st.fly = null
          if (perfect && hit.pts > 0) sfx.win()
          else sfx.thud()
          setScore(st.total)
          if (st.darts <= 0) {
            if (st.level < LEVELS.length - 1) nextLevel()
            else finish()
          }
        }
      }

      if (st.float) {
        st.float.t += dt
        if (st.float.t > 70) st.float = null
      }
      if (st.banner) {
        st.banner.t += dt
        if (st.banner.t > 95) st.banner = null
      }

      draw(ctx, st)
    }

    function wedge(ctx, cx, cy, a0, a1, r0, r1) {
      ctx.beginPath()
      ctx.arc(cx, cy, r1, a0, a1)
      ctx.arc(cx, cy, r0, a1, a0, true)
      ctx.closePath()
      ctx.fill()
    }

    function drawBoard(ctx, cx, cy) {
      // soft drop shadow
      const sh = ctx.createRadialGradient(cx, cy + 14, 30, cx, cy + 14, R + 40)
      sh.addColorStop(0, 'rgba(20,30,50,0.4)')
      sh.addColorStop(1, 'rgba(20,30,50,0)')
      ctx.fillStyle = sh
      ctx.beginPath()
      ctx.ellipse(cx, cy + 16, R + 34, R + 26, 0, 0, Math.PI * 2)
      ctx.fill()

      // wooden surround (the numbers sit on it)
      const wood = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R)
      wood.addColorStop(0, '#e8d5a8')
      wood.addColorStop(0.5, '#d9c08a')
      wood.addColorStop(1, '#c2a468')
      ctx.fillStyle = wood
      ctx.beginPath()
      ctx.arc(cx, cy, R + 13, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(90,60,20,0.55)'
      ctx.lineWidth = 2.5
      ctx.stroke()

      // 20 classic segments (18° each): cream/black singles, red/green triple & double
      for (let i = 0; i < 20; i++) {
        const a0 = ((-90 + i * 18 - 9) * Math.PI) / 180
        const a1 = a0 + Math.PI / 10
        const dark = BLACK_SEGS.has(SEGS[i])
        ctx.fillStyle = dark ? '#23262e' : '#efe3c0'
        wedge(ctx, cx, cy, a0, a1, BULL_OUT, TRIPLE_IN)
        wedge(ctx, cx, cy, a0, a1, TRIPLE_OUT, DOUBLE_IN)
        ctx.fillStyle = dark ? '#e63946' : '#2a9d8f'
        wedge(ctx, cx, cy, a0, a1, TRIPLE_IN, TRIPLE_OUT)
        wedge(ctx, cx, cy, a0, a1, DOUBLE_IN, R)
      }

      // bull (outer 25 red, inner 50 green — classic)
      ctx.fillStyle = '#e63946'
      ctx.beginPath()
      ctx.arc(cx, cy, BULL_OUT, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#2a9d8f'
      ctx.beginPath()
      ctx.arc(cx, cy, BULL_IN, 0, Math.PI * 2)
      ctx.fill()

      // wires
      ctx.strokeStyle = 'rgba(245,240,220,0.6)'
      ctx.lineWidth = 1
      for (const rr of [BULL_OUT, TRIPLE_IN, TRIPLE_OUT, DOUBLE_IN, R]) {
        ctx.beginPath()
        ctx.arc(cx, cy, rr, 0, Math.PI * 2)
        ctx.stroke()
      }
      for (let i = 0; i < 20; i++) {
        const a = ((-99 + i * 18) * Math.PI) / 180
        for (const [r0, r1] of [
          [BULL_OUT, TRIPLE_IN],
          [TRIPLE_OUT, DOUBLE_IN],
        ]) {
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
          ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
          ctx.stroke()
        }
      }

      // segment numbers (classic layout, 20 at the top)
      ctx.fillStyle = '#20242c'
      ctx.font = '800 11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let i = 0; i < 20; i++) {
        const a = ((-90 + i * 18) * Math.PI) / 180
        ctx.fillText(String(SEGS[i]), cx + Math.cos(a) * (R + 7), cy + Math.sin(a) * (R + 7))
      }
      ctx.textBaseline = 'alphabetic'

      // 3D dome: highlight top-left, shade bottom-right
      const hi = ctx.createRadialGradient(cx - 45, cy - 55, 8, cx - 20, cy - 20, R + 30)
      hi.addColorStop(0, 'rgba(255,255,255,0.22)')
      hi.addColorStop(0.5, 'rgba(255,255,255,0.05)')
      hi.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = hi
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fill()
      const lo = ctx.createRadialGradient(cx + 50, cy + 60, 10, cx + 20, cy + 30, R + 20)
      lo.addColorStop(0, 'rgba(0,0,20,0.25)')
      lo.addColorStop(1, 'rgba(0,0,20,0)')
      ctx.fillStyle = lo
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fill()
    }

    /** draw a dart so its TIP is exactly at (tx, ty), pointing up */
    function drawPinnedDart(ctx, tx, ty, scale = DART_SCALE) {
      ctx.fillStyle = 'rgba(20,30,50,0.35)'
      ctx.beginPath()
      ctx.ellipse(tx + 2, ty + 3, 4 * scale, 2 * scale, 0, 0, Math.PI * 2)
      ctx.fill()
      drawDart(ctx, tx, ty + TIP_LEN, 0, skinRef.current, scale)
    }

    function draw(ctx, st) {
      // cheerful sky
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#8ee0ff')
      bg.addColorStop(0.6, '#c9f3ff')
      bg.addColorStop(1, '#fff6d8')
      ctx.fillStyle = bg
      ctx.fillRect(-12, -12, W + 24, H + 24)
      drawSun(ctx, 322, 58, 20)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      drawCloud(ctx, 60 + Math.sin(st.t * 0.5) * 8, 70, 0.7)
      drawCloud(ctx, 300 + Math.sin(st.t * 0.4 + 2) * 8, 470, 0.6)

      const b = boardPos(st.t, st.level)
      drawBoard(ctx, b.x, b.y)

      // pinned darts ride the board (stored as offsets from its center)
      for (const d of st.thrown) drawPinnedDart(ctx, b.x + d.ox, b.y + d.oy)

      // flying dart
      if (st.fly) {
        const t = Math.min(st.fly.t, 1)
        const e = t * t
        const x = st.fly.fromX + (st.fly.toX - st.fly.fromX) * e
        const y = st.fly.fromY + (st.fly.toY - st.fly.fromY) * e
        drawDart(ctx, x, y + TIP_LEN * e, 0, skinRef.current, 0.7 + 0.45 * e)
      }

      // aim crosshair
      if (st.phase === 'playing' && !st.fly && st.levelPause <= 0) {
        const a = aimPos(st.t, st.level)
        ctx.strokeStyle = st.charging ? 'rgba(255,159,28,0.95)' : 'rgba(255,255,255,0.95)'
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.arc(a.x, a.y, 11, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(a.x - 17, a.y)
        ctx.lineTo(a.x - 6, a.y)
        ctx.moveTo(a.x + 6, a.y)
        ctx.lineTo(a.x + 17, a.y)
        ctx.moveTo(a.x, a.y - 17)
        ctx.lineTo(a.x, a.y - 6)
        ctx.moveTo(a.x, a.y + 6)
        ctx.lineTo(a.x, a.y + 17)
        ctx.stroke()
      }

      // floating points (bouncy)
      if (st.float) {
        const f = st.float
        const alpha = Math.max(0, 1 - f.t / 70)
        const size = f.t < 10 ? 18 + f.t * 1.6 : f.perfect ? 30 : 34
        ctx.globalAlpha = alpha
        ctx.font = `800 ${size}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.lineWidth = 5
        ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        const label = f.pts === 0 ? 'MISS' : f.perfect ? `PERFECT +${f.pts}` : f.tag ? `${f.tag} +${f.pts}` : `+${f.pts}`
        const ly = f.y - 26 - f.t * 0.6
        ctx.strokeText(label, f.x, ly)
        ctx.fillStyle = f.perfect ? '#ffd60a' : f.pts === 0 ? '#ff5d5d' : '#2b6cb0'
        ctx.fillText(label, f.x, ly)
        ctx.globalAlpha = 1
      }

      // level banner
      if (st.banner) {
        const sc = 1 + Math.max(0, 0.3 - st.banner.t * 0.012)
        ctx.save()
        ctx.translate(W / 2, 420)
        ctx.scale(sc, sc)
        ctx.textAlign = 'center'
        ctx.lineWidth = 7
        ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'
        ctx.font = '800 32px system-ui, sans-serif'
        ctx.strokeText(st.banner.text, 0, 0)
        ctx.fillStyle = '#22e07f'
        ctx.fillText(st.banner.text, 0, 0)
        ctx.font = '800 15px system-ui, sans-serif'
        ctx.strokeText(st.banner.sub, 0, 26)
        ctx.fillStyle = '#2b6cb0'
        ctx.fillText(st.banner.sub, 0, 26)
        ctx.restore()
      }

      // ---------- HUD ----------
      ctx.font = '800 30px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.lineWidth = 6
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.strokeText(String(st.total), 16, 44)
      ctx.fillStyle = '#2b6cb0'
      ctx.fillText(String(st.total), 16, 44)
      ctx.font = '700 10px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(43,70,110,0.7)'
      ctx.fillText('SCORE', 17, 58)

      // level chip
      ctx.font = '800 13px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      const lvText = `LEVEL ${st.level + 1}/5 · ${LEVELS[st.level].label}`
      ctx.strokeText(lvText, W / 2, 30)
      ctx.fillStyle = '#ef476f'
      ctx.fillText(lvText, W / 2, 30)

      // darts left (mini darts)
      for (let i = 0; i < DARTS_PER_LEVEL; i++) {
        ctx.globalAlpha = i < st.darts ? 1 : 0.25
        drawDart(ctx, W - 26 - i * 24, 46, Math.PI, skinRef.current, 0.6)
      }
      ctx.globalAlpha = 1

      // power meter (rounded, sweet band glows)
      const mx = W - 32
      const mt = 110
      const mh = 340
      const mw = 16
      ctx.fillStyle = 'rgba(20,35,60,0.55)'
      rr(ctx, mx, mt, mw, mh, 8)
      ctx.fill()
      // sweet band
      const yTop = mt + mh * (1 - (SWEET + SWEET_W) / 100)
      const yBot = mt + mh * (1 - (SWEET - SWEET_W) / 100)
      ctx.fillStyle = 'rgba(34,224,127,0.55)'
      rr(ctx, mx, yTop, mw, yBot - yTop, 3)
      ctx.fill()
      // sweet line
      const ys = mt + mh * (1 - SWEET / 100)
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(mx - 3, ys)
      ctx.lineTo(mx + mw + 3, ys)
      ctx.stroke()
      // fill
      if (st.charging) {
        const fh = (st.power / 100) * (mh - 4)
        const inSweet = st.power >= SWEET - SWEET_W && st.power <= SWEET + SWEET_W
        ctx.fillStyle = inSweet ? '#22e07f' : '#ffb703'
        rr(ctx, mx + 2, mt + 2 + (mh - 4) - fh, mw - 4, fh, 6)
        ctx.fill()
      }
      ctx.font = '800 10px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(43,70,110,0.8)'
      ctx.textAlign = 'center'
      ctx.fillText('POWER', mx + mw / 2, mt + mh + 18)
    }

    // ---------------- input ----------------
    const stage = stageRef.current
    function pointerXY(e) {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return null
      if (typeof e.clientX !== 'number' || typeof e.clientY !== 'number') return null
      const x = ((e.clientX - rect.left) / rect.width) * W
      const y = ((e.clientY - rect.top) / rect.height) * H
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      return { x: Math.min(W - 4, Math.max(4, x)), y: Math.min(H - 4, Math.max(4, y)) }
    }
    const onPointerMove = (e) => {
      const p = pointerXY(e)
      if (!p) return
      if (st.lastP) st.moved += Math.hypot(p.x - st.lastP.x, p.y - st.lastP.y)
      st.lastP = p
      st.pointer = { x: p.x, y: p.y, touch: e.pointerType !== 'mouse' }
    }
    const onPointerDown = (e) => {
      if (e.target.closest && e.target.closest('button')) return
      e.preventDefault()
      const p = pointerXY(e)
      if (p) {
        st.lastP = p
        st.pointer = { x: p.x, y: p.y, touch: e.pointerType !== 'mouse' }
      }
      press()
    }
    const onPointerUp = () => release()
    stage.addEventListener('pointermove', onPointerMove)
    stage.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    const onKeyDown = (e) => {
      if ((e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat) {
        e.preventDefault()
        press()
      }
    }
    const onKeyUp = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        release()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      stage.removeEventListener('pointermove', onPointerMove)
      stage.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  return (
    <div className="gameview" ref={stageRef}>
      <div className="gamebar">
        <button className="btn icon ghost" onClick={onExit} aria-label="Back">
          ←
        </button>
        <div className="gamebar-title">NimBullseye</div>
        <div className="gamebar-best">best {best}</div>
      </div>
      <div className="stage">
        <canvas ref={canvasRef} className="game" />
        {phase === 'ready' && (
          <div className="overlay">
            <div className="panel">
              <h2>NimBullseye</h2>
              <p className="panel-sub">
                A real dartboard: <b>BULL = 50</b>, triple ring = <b>T (3×)</b>, outer ring =
                <b> D (2×)</b> — the rest is the segment number. <b>TAP to place the crosshair</b>{' '}
                (the dart lands where it is, NOT where your finger is), <b>HOLD to charge</b>,{' '}
                <b>RELEASE in the green band</b> = 2× points. From level 3 the board starts
                moving — aim at where it will be when you release.
              </p>
              <p className="panel-hint">One finger · TAP = aim · HOLD to charge · RELEASE in the green band</p>
            </div>
          </div>
        )}
        {phase === 'over' && (
          <div className="overlay">
            <ScoreOverlay
              gameLabel="NimBullseye"
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
