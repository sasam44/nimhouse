import { useEffect, useRef, useState } from 'react'
import { drawChicken, drawSun, drawCloud, rr } from '../sketch'
import { sfx, setMuted, isMuted } from '../sound'
import { bestScore, submitScore } from '../leaderboard'
import { getDeviceId } from '../wallet'
import ScoreOverlay from '../components/ScoreOverlay'

const W = 360
const H = 600
const GRAV = 0.35
const BOUNCE = 11.6
const SPRING_BOOST = 18.5
const PLAT_W = 46
const BASE_Y = 572
const ANCHOR = 240
const SEED = 20260913

const QUOTES = [
  'Gravity: 1, Mustache: 0.',
  'So close to the sun. The sun does not, sadly, pay rent.',
  'The ground was always going to win eventually.',
  'The clouds offered to catch you. They declined.',
  'New personal best? Ask the platform.',
]

/** Fixed-seed PRNG → every player sees the exact same tower. Pure skill. */
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function drawPlatform(ctx, p) {
  const c = ctx
  c.fillStyle = '#3d8ba1'
  rr(c, p.x - p.w / 2, p.y, p.w, 9, 4.5)
  c.fill()
  c.fillStyle = 'rgba(255,255,255,0.3)'
  rr(c, p.x - p.w / 2 + 2, p.y + 1, p.w - 4, 3, 2)
  c.fill()
  c.fillStyle = 'rgba(0,0,0,0.15)'
  c.fillRect(p.x - p.w / 2 + 2, p.y + 6.5, p.w - 4, 1.6)
  if (p.kind === 'moving') {
    c.fillStyle = 'rgba(255,214,10,0.9)'
    c.beginPath()
    c.arc(p.x - p.w / 2 + 6, p.y + 4.5, 1.8, 0, Math.PI * 2)
    c.arc(p.x + p.w / 2 - 6, p.y + 4.5, 1.8, 0, Math.PI * 2)
    c.fill()
  }
}

function drawSpring(ctx, x, yTop) {
  ctx.strokeStyle = '#cdd5de'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i < 3; i++) {
    ctx.moveTo(x - 7, yTop - 5 - i * 4)
    ctx.lineTo(x + 7, yTop - 9 - i * 4)
  }
  ctx.stroke()
  ctx.fillStyle = '#e63946'
  rr(ctx, x - 9, yTop - 5.5, 18, 5.5, 2)
  ctx.fill()
  rr(ctx, x - 8, yTop - 18, 16, 4, 2)
  ctx.fill()
}

function hudBox(ctx, x, y, text, align) {
  ctx.font = '700 14px system-ui, sans-serif'
  const tw = ctx.measureText(text).width
  const bx = align === 'right' ? x - tw - 18 : x
  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  rr(ctx, bx, y, tw + 18, 26, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(60,100,120,0.55)'
  ctx.lineWidth = 2
  rr(ctx, bx, y, tw + 18, 8, 8)
  ctx.stroke()
  ctx.fillStyle = '#2b4a5a'
  ctx.textAlign = 'left'
  ctx.fillText(text, bx + 9, y + 18)
}

export default function NimHop({ skin, player, onExit, onScore, requestVerify, walletMode }) {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const controls = useRef({ replay: () => {}, held: { l: false, r: false } })
  const skinRef = useRef(skin)
  skinRef.current = skin
  const playerRef = useRef(player)
  playerRef.current = player
  const onScoreRef = useRef(onScore)
  onScoreRef.current = onScore

  const [phase, setPhase] = useState('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => bestScore('hop'))
  const bestRef = useRef(best)
  bestRef.current = best
  const [muted, setMutedUI] = useState(() => isMuted())
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
      phase: 'ready', // ready | play | over
      t: 0,
      chick: { x: W / 2, y: BASE_Y - 12, vx: 0, vy: 0 },
      camY: 0,
      plats: [],
      genY: BASE_Y,
      rnd: null,
      puffs: [],
      held: { l: false, r: false },
      keys: { l: false, r: false },
      dragX: null,
      height: 0,
      groundAlive: true,
      lastShown: -1,
    }

    function nextPlat(first) {
      const r = st.rnd
      const h = (BASE_Y - st.genY) / 10
      const gap = Math.min(58 + h * 0.5 + r() * 26, 100)
      st.genY -= gap
      let x = r() * (W - PLAT_W)
      if (first) x = W / 2 - PLAT_W / 2 + (r() * 44 - 22)
      let spring = false
      let mv = null
      if (h > 10 && r() < 0.08) spring = true
      if (h > 20 && r() < Math.min(0.1 + h * 0.001, 0.28)) {
        const amp = 34 + r() * 46
        mv = { base: Math.max(amp, Math.min(W - PLAT_W - amp, x)), amp, sp: 0.8 + r() * 1.0, ph: r() * Math.PI * 2 }
      }
      st.plats.push({ y: st.genY, x: mv ? mv.base : x, w: PLAT_W, kind: mv ? 'moving' : 'normal', spring, mv })
    }

    function start() {
      st.rnd = mulberry32(SEED)
      st.t = 0
      st.camY = 0
      st.height = 0
      st.groundAlive = true
      st.puffs = []
      st.dragX = null
      st.plats = [{ y: BASE_Y, x: W / 2, w: W, kind: 'ground' }]
      st.genY = BASE_Y
      for (let i = 0; i < 10; i++) nextPlat(i === 0)
      st.chick = { x: W / 2, y: BASE_Y - 12, vx: 0, vy: -BOUNCE }
      st.phase = 'play'
      setPhase('play')
      setScore(0)
      sfx.flap()
    }

    function finish() {
      st.phase = 'over'
      setPhase('over')
      const prevBest = bestScore('hop')
      const isBest = st.height > prevBest
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
      const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      getDeviceId().then((device) => {
        const res = submitScore('hop', {
          id,
          name: playerRef.current || 'Anonymous',
          score: st.height,
          device,
          verified: false,
          ts: Date.now(),
        })
        setEntry({ id, rank: res.rank, isBest })
        setBest(Math.max(prevBest, st.height))
        onScoreRef.current?.('hop', st.height)
      })
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

      if (st.phase === 'play') {
        const c = st.chick
        // steering
        const left = st.held.l || st.keys.l
        const right = st.held.r || st.keys.r
        if (left) c.vx -= 0.55 * dt
        if (right) c.vx += 0.55 * dt
        if (st.dragX !== null) {
          const d = st.dragX - c.x
          c.vx = Math.max(-7.5, Math.min(7.5, d * 0.22))
        } else if (!left && !right) {
          c.vx *= Math.pow(0.9, dt)
        }
        c.vx = Math.max(-7.5, Math.min(7.5, c.vx))
        c.x += c.vx * dt
        // wrap around edges
        if (c.x < -14) c.x = W + 14
        if (c.x > W + 14) c.x = -14
        // gravity
        const prevBottom = c.y + 12
        c.vy += GRAV * dt
        c.y += c.vy * dt
        const bottom = c.y + 12
        // platform collision (falling only)
        if (c.vy > 0) {
          for (const p of st.plats) {
            const px = p.mv ? p.mv.base + Math.sin(st.t * p.mv.sp + p.mv.ph) * p.mv.amp : p.x
            if (prevBottom <= p.y + 3 && bottom >= p.y && Math.abs(c.x - px) < p.w / 2 + 8) {
              if (p.kind === 'ground') {
                st.groundAlive = false
                c.vy = -BOUNCE
                sfx.flap()
              } else if (p.spring && Math.abs(c.x - px) < 16) {
                p.spring = false
                c.vy = -SPRING_BOOST
                sfx.win()
              } else {
                c.vy = -BOUNCE
                sfx.flap()
              }
              c.y = p.y - 12
              for (let i = 0; i < 4; i++) {
                st.puffs.push({ x: c.x + (i - 1.5) * 5, y: p.y, vx: (i - 1.5) * 0.4, vy: 0.5, life: 14 })
              }
              break
            }
          }
        }
        // moving platforms — update live x
        for (const p of st.plats) {
          if (p.mv) p.x = p.mv.base + Math.sin(st.t * p.mv.sp + p.mv.ph) * p.mv.amp
        }
        // camera follows upward
        if (c.y < st.camY + ANCHOR) st.camY = c.y - ANCHOR
        // height
        st.height = Math.max(st.height, Math.floor((BASE_Y - 12 - c.y) / 10))
        // spawn ahead / cull behind
        while (st.genY > st.camY - 80) nextPlat(false)
        st.plats = st.plats.filter((p) => p.kind === 'ground' ? st.groundAlive && p.y < st.camY + H + 60 : p.y < st.camY + H + 60)
        // fell off the bottom
        if (c.y > st.camY + H + 50) finish()
      }

      for (const p of st.puffs) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
      }
      st.puffs = st.puffs.filter((p) => p.life > 0)

      if (st.height !== st.lastShown) {
        st.lastShown = st.height
        setScore(st.height)
      }

      draw(ctx, st)
    }

    function draw(ctx, st) {
      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#bfeaff')
      sky.addColorStop(0.7, '#dcf4ff')
      sky.addColorStop(1, '#eefaff')
      ctx.fillStyle = sky
      ctx.fillRect(-14, -14, W + 28, H + 28)
      drawSun(ctx, 298, 84, 22)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      drawCloud(ctx, 70 + Math.sin(st.t * 0.4) * 9, 150, 0.75)
      drawCloud(ctx, 250 + Math.sin(st.t * 0.3 + 2) * 9, 330, 0.6)

      const cy = (wy) => wy - st.camY
      // ground (initial screen only)
      if (st.groundAlive) {
        const gy = cy(BASE_Y)
        if (gy < H) {
          ctx.fillStyle = '#7ed957'
          ctx.fillRect(-14, gy + 9, W + 28, H - gy)
          ctx.fillStyle = '#5cbf3d'
          ctx.fillRect(-14, gy + 9, W + 28, 4)
          ctx.fillStyle = 'rgba(255,255,255,0.35)'
          for (let x = 6; x < W; x += 34) {
            ctx.beginPath()
            ctx.moveTo(x, gy + 10)
            ctx.lineTo(x + 4, gy + 4)
            ctx.lineTo(x + 8, gy + 10)
            ctx.closePath()
            ctx.fill()
          }
        }
      }
      // platforms
      for (const p of st.plats) {
        const py = cy(p.y)
        if (py < -20 || py > H + 20) continue
        if (p.kind === 'ground') continue
        drawPlatform(ctx, { ...p, y: py })
        if (p.spring) drawSpring(ctx, p.x, py)
      }
      // bounce puffs
      for (const p of st.puffs) {
        ctx.globalAlpha = Math.max(0, p.life / 14) * 0.8
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(p.x, cy(p.y) + 4, 3 + (14 - p.life) * 0.5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      // the chick
      const c = st.chick
      const rot = Math.max(-0.22, Math.min(0.3, c.vy * 0.02))
      drawChicken(ctx, c.x, cy(c.y), 1.0, skinRef.current, st.t, st.phase === 'play' ? st.t * 10 : 0.6, rot)

      // HUD
      hudBox(ctx, 14, 14, `Height: ${st.height}`, 'left')
      hudBox(ctx, W - 14, 14, `Best: ${Math.max(bestRef.current, st.height)}`, 'right')

      // first-run hint
      if (st.phase === 'play' && st.t < 3 && st.height < 3) {
        ctx.font = '700 13px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.lineWidth = 4
        ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.strokeText('Hold ◀ ▶ or drag to steer', W / 2, 470)
        ctx.fillStyle = '#2b6cb0'
        ctx.fillText('Hold ◀ ▶ or drag to steer', W / 2, 470)
      }
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
      st.dragX = toCanvas(e).x
    }
    const onPointerMove = (e) => {
      if (st.dragX !== null) st.dragX = toCanvas(e).x
    }
    const onPointerUp = () => {
      st.dragX = null
    }
    stage.addEventListener('pointerdown', onPointerDown)
    stage.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    const onKey = (e) => {
      const down = e.type === 'keydown'
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') st.keys.l = down
      if (e.code === 'ArrowRight' || e.code === 'KeyD') st.keys.r = down
      if (down && !e.repeat && (e.code === 'Space' || e.code === 'Enter') && st.phase === 'ready') {
        e.preventDefault()
        start()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      stage.removeEventListener('pointerdown', onPointerDown)
      stage.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  const holdBtn = (side, on) => (e) => {
    e.stopPropagation()
    controls.current.held[side] = on
  }

  return (
    <div className="gameview" ref={stageRef}>
      <div className="gamebar">
        <button className="btn icon ghost" onClick={onExit} aria-label="Back">
          ←
        </button>
        <div className="gamebar-title">NimHop</div>
        <div className="gamebar-best">best {best} m</div>
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
        <button className="hopbtn" style={{ left: 14 }} onPointerDown={holdBtn('l', true)} onPointerUp={holdBtn('l', false)} onPointerLeave={holdBtn('l', false)} onPointerCancel={holdBtn('l', false)} aria-label="Move left">
          ◀
        </button>
        <button className="hopbtn" style={{ right: 14 }} onPointerDown={holdBtn('r', true)} onPointerUp={holdBtn('r', false)} onPointerLeave={holdBtn('r', false)} onPointerCancel={holdBtn('r', false)} aria-label="Move right">
          ▶
        </button>
        {phase === 'ready' && (
          <div className="overlay">
            <div className="panel">
              <h2>NimHop</h2>
              <p className="panel-sub">
                Your mustachioed chick bounces on its own — your job is to steer it up an endless
                tower of platforms. Spring pads launch you way higher; moving platforms wobble.
              </p>
              <p className="panel-hint">HOLD ◀ ▶ or DRAG to steer · edges wrap around</p>
              <p className="panel-hint">Fall off the bottom and it is over. How high can you go?</p>
            </div>
          </div>
        )}
        {phase === 'over' && (
          <div className="overlay">
            <ScoreOverlay
              gameLabel="NimHop"
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
