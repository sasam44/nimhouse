import { useEffect, useRef, useState } from 'react'
import { drawChicken, drawSun, drawCloud, drawSausage, rr } from '../sketch'
import { sfx } from '../sound'
import { bestScore, submitScore } from '../leaderboard'
import { getDeviceId } from '../wallet'
import ScoreOverlay from '../components/ScoreOverlay'

const W = 360
const H = 600
const GROUND = 478
const REST = { x: 72, y: 452 }
const FORK_L = { x: 58, y: 428 }
const FORK_R = { x: 86, y: 428 }
const GRAV = 0.38
const PULL_MAX = 72
const POWER = 0.19
const MAXV = 17.5
const CHICK_R = 11
const TARGET_R = 13
const CRATE = 26
const SHOTS_PER_LEVEL = 3

const QUOTES = [
  'The sausages demand a rematch.',
  'One chick. Three shots. Infinite regrets.',
  'Physics said no.',
  'The band snapped. So did your confidence.',
  'Sausage supremacy: secured.',
]

/** Deterministic crate/sausage tower per level. */
function buildTargets(level) {
  const cx = 238 + Math.min((level - 1) * 6, 30)
  const crates = []
  for (const dx of [-CRATE, 0, CRATE]) crates.push({ x: cx + dx, y: GROUND - CRATE })
  if (level >= 2) crates.push({ x: cx, y: GROUND - 2 * CRATE })
  if (level >= 3) {
    crates.push({ x: cx - CRATE / 2, y: GROUND - 2 * CRATE })
    crates.push({ x: cx + CRATE / 2, y: GROUND - 2 * CRATE })
  }
  if (level >= 4) crates.push({ x: cx, y: GROUND - 3 * CRATE })
  return crates.map((c) => ({ x: c.x, y: c.y - 13, hit: false, crateX: c.x, crateY: c.y }))
}

function drawCrate(ctx, x, y) {
  ctx.fillStyle = '#c9853f'
  ctx.fillRect(x, y, CRATE, CRATE)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(x, y, CRATE, 4)
  ctx.strokeStyle = '#8d5524'
  ctx.lineWidth = 2
  ctx.strokeRect(x + 1, y + 1, CRATE - 2, CRATE - 2)
  ctx.beginPath()
  ctx.moveTo(x + 4, y + 4)
  ctx.lineTo(x + CRATE - 4, y + CRATE - 4)
  ctx.moveTo(x + CRATE - 4, y + 4)
  ctx.lineTo(x + 4, y + CRATE - 4)
  ctx.stroke()
}

function drawFlower(ctx, x, y, c) {
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

export default function NimCannon({ skin, player, onExit, onScore, requestVerify, walletMode }) {
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
  const [best, setBest] = useState(() => bestScore('cannon'))
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
      phase: 'ready', // ready | aim | flying | settling | levelup | over
      t: 0,
      level: 1,
      shots: SHOTS_PER_LEVEL,
      score: 0,
      targets: buildTargets(1),
      chick: { x: REST.x, y: REST.y, vx: 0, vy: 0, rot: 0, bounces: 0 },
      drag: null,
      pops: [],
      msg: null,
      msgT: 0,
      settleT: 0,
      levelT: 0,
      lastShown: -1,
    }

    function start() {
      st.phase = 'aim'
      setPhase('aim')
    }

    function finish() {
      st.phase = 'over'
      setPhase('over')
      const prevBest = bestScore('cannon')
      const isBest = st.score > prevBest
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
      const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      getDeviceId().then((device) => {
        const res = submitScore('cannon', {
          id,
          name: playerRef.current || 'Anonymous',
          score: st.score,
          device,
          verified: false,
          ts: Date.now(),
        })
        setEntry({ id, rank: res.rank, isBest })
        setBest(Math.max(prevBest, st.score))
        onScoreRef.current?.('cannon', st.score)
      })
    }

    function pullVec() {
      if (!st.drag) return null
      const dx = st.drag.x - REST.x
      const dy = st.drag.y - REST.y
      const len = Math.hypot(dx, dy)
      if (len < 1) return null
      const cl = Math.min(len, PULL_MAX)
      const ux = dx / len
      const uy = dy / len
      return { px: REST.x + ux * cl, py: REST.y + uy * cl, vx: -ux * cl * POWER, vy: -uy * cl * POWER, len: cl }
    }

    function fire() {
      const v = pullVec()
      st.drag = null
      if (!v || v.len < 14) return
      let { vx, vy } = v
      const sp = Math.hypot(vx, vy)
      if (sp > MAXV) {
        vx *= MAXV / sp
        vy *= MAXV / sp
      }
      st.shots -= 1
      st.chick = { x: REST.x, y: REST.y, vx, vy, rot: 0, bounces: 0 }
      st.phase = 'flying'
      sfx.flap()
    }

    function endRound() {
      st.phase = 'settling'
      st.settleT = 0
    }

    function popFx(x, y) {
      const cols = ['#ef476f', '#ffd60a', '#06d6a0', '#4cc9f0', '#ff9f1c']
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const sp = 2 + Math.random() * 3
        st.pops.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 2,
          life: 26 + Math.random() * 10,
          c: cols[i % cols.length],
        })
      }
    }

    controls.current.replay = () => {
      st.phase = 'ready'
      st.t = 0
      st.level = 1
      st.shots = SHOTS_PER_LEVEL
      st.score = 0
      st.targets = buildTargets(1)
      st.chick = { x: REST.x, y: REST.y, vx: 0, vy: 0, rot: 0, bounces: 0 }
      st.drag = null
      st.pops = []
      st.msg = null
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

      if (st.phase === 'flying') {
        const c = st.chick
        c.vy += GRAV * dt
        c.x += c.vx * dt
        c.y += c.vy * dt
        c.rot = Math.max(-0.5, Math.min(1.15, c.vy * 0.05))
        for (const t of st.targets) {
          if (!t.hit && Math.hypot(c.x - t.x, c.y - t.y) < CHICK_R + TARGET_R) {
            t.hit = true
            st.score += 10
            popFx(t.x, t.y)
            c.vx *= 0.82
            c.vy *= 0.82
            sfx.pop()
          }
        }
        // ground bounce
        if (c.y > GROUND - CHICK_R && c.vy > 0) {
          c.y = GROUND - CHICK_R
          c.vy *= -0.45
          c.vx *= 0.78
          c.bounces += 1
          if (c.bounces >= 3 || Math.abs(c.vy) < 1.8) {
            c.vy = 0
            endRound()
          }
        }
        if (c.x > W + 60 || c.x < -60 || c.y > H + 80) endRound()
      } else if (st.phase === 'settling') {
        st.settleT += dt
        if (st.settleT > 42) {
          const remaining = st.targets.filter((t) => !t.hit).length
          if (remaining === 0) {
            const bonus = st.shots * 20
            st.score += bonus
            st.msg = { text: bonus > 0 ? `LEVEL ${st.level} CLEAR! +${bonus}` : `LEVEL ${st.level} CLEAR!`, t: 0 }
            st.msgT = 0
            st.phase = 'levelup'
            st.levelT = 0
          } else if (st.shots <= 0) {
            finish()
          } else {
            st.chick = { x: REST.x, y: REST.y, vx: 0, vy: 0, rot: 0, bounces: 0 }
            st.phase = 'aim'
            setPhase('aim')
          }
        }
      } else if (st.phase === 'levelup') {
        st.levelT += dt
        if (st.msg) {
          st.msg.t += dt
          if (st.msg.t > 80) st.msg = null
        }
        if (st.levelT > 95) {
          st.level += 1
          st.targets = buildTargets(st.level)
          st.shots = SHOTS_PER_LEVEL
          st.chick = { x: REST.x, y: REST.y, vx: 0, vy: 0, rot: 0, bounces: 0 }
          st.phase = 'aim'
          setPhase('aim')
        }
      }

      for (const p of st.pops) {
        p.vy += 0.22 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
      }
      st.pops = st.pops.filter((p) => p.life > 0)

      if (st.score !== st.lastShown) {
        st.lastShown = st.score
        setScore(st.score)
      }

      draw(ctx, st)
    }

    function draw(ctx, st) {
      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#8ee0ff')
      sky.addColorStop(0.55, '#c9f3ff')
      sky.addColorStop(1, '#fff6d8')
      ctx.fillStyle = sky
      ctx.fillRect(-12, -12, W + 24, H + 24)
      drawSun(ctx, 306, 64, 24)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      drawCloud(ctx, 70 + Math.sin(st.t * 0.5) * 8, 84, 0.85)
      drawCloud(ctx, 230 + Math.sin(st.t * 0.4 + 2) * 8, 140, 0.6)

      // hills
      ctx.fillStyle = 'rgba(122,214,133,0.6)'
      ctx.beginPath()
      ctx.moveTo(-10, GROUND)
      for (let x = -10; x <= W + 10; x += 12) {
        ctx.lineTo(x, GROUND - Math.abs(Math.sin(x * 0.025)) * 22)
      }
      ctx.lineTo(W + 10, GROUND)
      ctx.closePath()
      ctx.fill()

      // ground
      ctx.fillStyle = '#7ed957'
      ctx.fillRect(-12, GROUND, W + 24, 12)
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(-12, GROUND, W + 24, 3)
      ctx.fillStyle = '#e0a55e'
      ctx.fillRect(-12, GROUND + 12, W + 24, H - GROUND - 12)
      ctx.fillStyle = 'rgba(0,0,0,0.07)'
      for (let x = -52; x < W + 52; x += 52) {
        ctx.fillRect(x, GROUND + 12, 26, H - GROUND - 12)
      }
      drawFlower(ctx, 40, GROUND - 2, '#ff8fab')
      drawFlower(ctx, 150, GROUND - 2, '#c77dff')
      drawFlower(ctx, 320, GROUND - 2, '#ff8fab')

      // target crates
      for (const t of st.targets) {
        drawCrate(ctx, t.crateX - CRATE / 2, t.crateY)
      }

      // sausage targets
      for (const t of st.targets) {
        if (t.hit) continue
        const bob = Math.sin(st.t * 2 + t.x) * 1.5
        ctx.fillStyle = 'rgba(0,0,0,0.15)'
        ctx.beginPath()
        ctx.ellipse(t.x, t.crateY + 1, 15, 3.5, 0, 0, Math.PI * 2)
        ctx.fill()
        drawSausage(ctx, t.x, t.y + bob, 1)
      }

      // slingshot (drawn behind the chick when at rest)
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#6e3f16'
      ctx.lineWidth = 9
      ctx.beginPath()
      ctx.moveTo(REST.x, 500)
      ctx.lineTo(REST.x, 446)
      ctx.moveTo(REST.x, 446)
      ctx.lineTo(FORK_L.x, FORK_L.y)
      ctx.moveTo(REST.x, 446)
      ctx.lineTo(FORK_R.x, FORK_R.y)
      ctx.stroke()
      ctx.strokeStyle = '#a8672f'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(REST.x, 500)
      ctx.lineTo(REST.x, 446)
      ctx.moveTo(REST.x, 446)
      ctx.lineTo(FORK_L.x, FORK_L.y)
      ctx.moveTo(REST.x, 446)
      ctx.lineTo(FORK_R.x, FORK_R.y)
      ctx.stroke()

      const pv = pullVec()
      const chickPos =
        st.phase === 'aim' && pv ? { x: pv.px, y: pv.py } : st.phase === 'flying' || st.phase === 'settling' ? st.chick : { x: REST.x, y: REST.y }

      // band
      if (st.phase !== 'flying' && st.phase !== 'settling') {
        ctx.strokeStyle = '#ef476f'
        ctx.lineWidth = 4.5
        ctx.beginPath()
        ctx.moveTo(FORK_L.x, FORK_L.y)
        ctx.lineTo(chickPos.x, chickPos.y)
        ctx.lineTo(FORK_R.x, FORK_R.y)
        ctx.stroke()
      }

      // trajectory preview
      if (st.phase === 'aim' && pv && pv.len >= 14) {
        let px = REST.x
        let py = REST.y
        let vx = pv.vx
        let vy = pv.vy
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        for (let i = 0; i < 72; i++) {
          vy += GRAV
          px += vx
          py += vy
          if (i % 4 === 0) {
            ctx.globalAlpha = 1 - i / 90
            ctx.beginPath()
            ctx.arc(px, py, 2.6, 0, Math.PI * 2)
            ctx.fill()
          }
          if (py > GROUND) break
        }
        ctx.globalAlpha = 1
      }

      // the chick
      if (st.phase === 'flying' || st.phase === 'settling') {
        const c = st.chick
        ctx.fillStyle = 'rgba(0,0,0,0.2)'
        ctx.beginPath()
        ctx.ellipse(c.x, GROUND + 2, 16, 4, 0, 0, Math.PI * 2)
        ctx.fill()
        drawChicken(ctx, c.x, c.y, 1.0, skinRef.current, st.t, st.t * 14, c.rot)
      } else {
        drawChicken(ctx, chickPos.x, chickPos.y, 0.95, skinRef.current, st.t, 0.6, pv ? -0.15 : Math.sin(st.t * 2) * 0.04)
      }

      // pop confetti
      for (const p of st.pops) {
        ctx.globalAlpha = Math.max(0, p.life / 30)
        ctx.fillStyle = p.c
        ctx.beginPath()
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // HUD
      ctx.font = '800 20px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.lineWidth = 5
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.strokeText(`LEVEL ${st.level}`, 16, 36)
      ctx.fillStyle = '#2b6cb0'
      ctx.fillText(`LEVEL ${st.level}`, 16, 36)
      ctx.font = '800 26px system-ui, sans-serif'
      ctx.strokeText(String(st.score), 16, 66)
      ctx.fillText(String(st.score), 16, 66)
      // shots left
      for (let i = 0; i < SHOTS_PER_LEVEL; i++) {
        ctx.globalAlpha = i < st.shots ? 1 : 0.22
        ctx.save()
        ctx.translate(W - 26 - i * 26, 40)
        ctx.scale(0.42, 0.42)
        drawChicken(ctx, 0, 6, 1, skinRef.current, 0.6, 0.5, 0)
        ctx.restore()
      }
      ctx.globalAlpha = 1

      // level-clear banner
      if (st.msg) {
        const sc = 1 + Math.max(0, 0.25 - st.msg.t * 0.01)
        ctx.save()
        ctx.translate(W / 2, 200)
        ctx.scale(sc, sc)
        ctx.font = '800 30px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.lineWidth = 7
        ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'
        ctx.strokeText(st.msg.text, 0, 0)
        ctx.fillStyle = '#22e07f'
        ctx.fillText(st.msg.text, 0, 0)
        ctx.restore()
      }

      // first-time hint
      if (st.phase === 'aim' && st.level === 1 && st.shots === SHOTS_PER_LEVEL && !st.drag) {
        ctx.font = '700 13px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.fillText('DRAG & RELEASE to launch', W / 2, 560)
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
      if (st.phase === 'aim') st.drag = toCanvas(e)
    }
    const onPointerMove = (e) => {
      if (st.drag) st.drag = toCanvas(e)
    }
    const onPointerUp = () => {
      if (st.drag) fire()
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
        <div className="gamebar-title">NimCannon</div>
        <div className="gamebar-best">best {best}</div>
      </div>
      <div className="stage">
        <canvas ref={canvasRef} className="game" />
        {phase === 'ready' && (
          <div className="overlay">
            <div className="panel">
              <h2>NimCannon</h2>
              <p className="panel-sub">
                Drag, aim, release. Fling your chick through the sausage tower. Three shots per
                level — clear it to advance.
              </p>
              <p className="panel-hint">DRAG &amp; RELEASE to launch</p>
            </div>
          </div>
        )}
        {phase === 'over' && (
          <div className="overlay">
            <ScoreOverlay
              gameLabel="NimCannon"
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
