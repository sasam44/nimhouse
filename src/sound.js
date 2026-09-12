/**
 * Tiny WebAudio sound effects — no audio assets needed.
 * The AudioContext is created lazily on the first user gesture.
 */
let ctx = null
let muted = false

export const setMuted = (m) => {
  muted = m
}
export const isMuted = () => muted

function audio() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function beep(freq = 440, dur = 0.08, type = 'square', vol = 0.05, slideTo = 0) {
  if (muted) return
  const c = audio()
  if (!c) return
  try {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.value = freq
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), c.currentTime + dur)
    g.gain.value = vol
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
    o.connect(g)
    g.connect(c.destination)
    o.start()
    o.stop(c.currentTime + dur + 0.03)
  } catch {
    /* audio is decorative — never break the game */
  }
}

export const sfx = {
  flap: () => beep(500, 0.07, 'square', 0.045, 700),
  score: () => {
    beep(660, 0.06, 'square', 0.045)
    setTimeout(() => beep(880, 0.09, 'square', 0.045), 70)
  },
  hit: () => beep(150, 0.28, 'sawtooth', 0.06, 60),
  drop: () => beep(320, 0.08, 'triangle', 0.05, 180),
  thud: () => beep(220, 0.1, 'triangle', 0.05, 120),
  pop: () => beep(900, 0.05, 'sine', 0.045),
  win: () => {
    beep(523, 0.09, 'sine', 0.05)
    setTimeout(() => beep(659, 0.09, 'sine', 0.05), 100)
    setTimeout(() => beep(784, 0.16, 'sine', 0.05), 200)
  },
  buy: () => {
    beep(700, 0.07, 'sine', 0.05)
    setTimeout(() => beep(1050, 0.1, 'sine', 0.05), 90)
  },
}
