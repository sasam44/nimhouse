/**
 * Shared canvas drawing helpers. Pure functions — no game state in here.
 */

/**
 * Draw the absurd NimHouse chicken.
 * @param ctx canvas 2d context
 * @param x,y center position (feet-ish)
 * @param s scale (1 => ~48px tall)
 * @param skin skin object from skins.js
 * @param t time in seconds (idle wobble)
 * @param flap wing animation phase (radians)
 * @param rot body rotation (radians)
 */
export function drawChicken(ctx, x, y, s, skin, t = 0, flap = 0, rot = 0) {
  const c = skin.colors
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)

  // cape (if any skin has one)
  if (skin.accessory === 'cape') {
    ctx.fillStyle = c.accent || '#e63946'
    ctx.beginPath()
    ctx.moveTo(-8 * s, -6 * s)
    ctx.quadraticCurveTo(-30 * s, 8 * s + Math.sin(t * 3) * 3 * s, -14 * s, 20 * s)
    ctx.quadraticCurveTo(-4 * s, 10 * s, -6 * s, 4 * s)
    ctx.closePath()
    ctx.fill()
  }

  // tail feathers
  ctx.strokeStyle = c.wing
  ctx.lineWidth = 3 * s
  ctx.lineCap = 'round'
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath()
    ctx.moveTo(-14 * s, i * 4 * s)
    ctx.quadraticCurveTo(
      -24 * s,
      i * 8 * s - 2 * s,
      -27 * s,
      i * 10 * s + Math.sin(t * 4 + i) * 2 * s
    )
    ctx.stroke()
  }

  // body
  ctx.fillStyle = c.body
  ctx.beginPath()
  ctx.ellipse(0, 0, 17 * s, 15 * s, 0, 0, Math.PI * 2)
  ctx.fill()

  // wing (flapping)
  ctx.fillStyle = c.wing
  ctx.save()
  ctx.translate(-2 * s, 0)
  ctx.rotate(-0.5 + Math.sin(flap) * 0.55)
  ctx.beginPath()
  ctx.ellipse(-6 * s, 3 * s, 10 * s, 6 * s, 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // head
  ctx.fillStyle = c.body
  ctx.beginPath()
  ctx.arc(13 * s, -13 * s, 11 * s, 0, Math.PI * 2)
  ctx.fill()

  // comb
  ctx.fillStyle = c.comb
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc((8 + i * 4.5) * s, -23 * s - (i === 1 ? 2 * s : 0), 2.6 * s, 0, Math.PI * 2)
    ctx.fill()
  }

  // beak
  ctx.fillStyle = c.beak
  ctx.beginPath()
  ctx.moveTo(23 * s, -15.5 * s)
  ctx.lineTo(31 * s, -12.5 * s)
  ctx.lineTo(23 * s, -9.5 * s)
  ctx.closePath()
  ctx.fill()

  // absurd mustache
  ctx.strokeStyle = c.mustache
  ctx.lineWidth = 1.7 * s
  ctx.beginPath()
  ctx.moveTo(24.5 * s, -8.5 * s)
  ctx.quadraticCurveTo(27.5 * s, -10.5 * s, 29.5 * s, -8.5 * s)
  ctx.moveTo(24.5 * s, -7.5 * s)
  ctx.quadraticCurveTo(27 * s, -5.5 * s, 29 * s, -6.5 * s)
  ctx.stroke()

  // googly eye
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(16 * s, -15 * s, 4.6 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1c1c1c'
  ctx.beginPath()
  ctx.arc(16 * s + Math.sin(t * 2.2) * 1.2 * s, -15 * s + Math.cos(t * 1.7) * 1 * s, 2 * s, 0, Math.PI * 2)
  ctx.fill()

  // accessories
  if (skin.accessory === 'helmet') {
    ctx.fillStyle = 'rgba(190,225,255,0.88)'
    ctx.beginPath()
    ctx.arc(13 * s, -13 * s, 12.5 * s, Math.PI * 0.92, Math.PI * 2.08)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.ellipse(9.5 * s, -19 * s, 4 * s, 1.8 * s, -0.5, 0, Math.PI * 2)
    ctx.fill()
  } else if (skin.accessory === 'sunglasses') {
    ctx.fillStyle = '#141414'
    ctx.fillRect(10.5 * s, -18.5 * s, 6.5 * s, 4.8 * s)
    ctx.fillRect(19 * s, -18.5 * s, 6.5 * s, 4.8 * s)
    ctx.fillRect(16.5 * s, -17.5 * s, 3 * s, 1.3 * s)
  } else if (skin.accessory === 'crown') {
    ctx.fillStyle = '#ffd23f'
    ctx.beginPath()
    ctx.moveTo(6 * s, -23.5 * s)
    ctx.lineTo(8 * s, -29 * s)
    ctx.lineTo(11 * s, -25 * s)
    ctx.lineTo(13.5 * s, -30 * s)
    ctx.lineTo(16 * s, -25 * s)
    ctx.lineTo(19 * s, -29 * s)
    ctx.lineTo(20.5 * s, -23.5 * s)
    ctx.closePath()
    ctx.fill()
  }

  ctx.restore()
}

/**
 * Draw a dart pointing UP (tip at top). `angle` rotates it.
 */
export function drawDart(ctx, x, y, angle, skin, scale = 1) {
  const c = skin.colors
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  // barrel
  ctx.fillStyle = c.barrel
  ctx.fillRect(-2 * scale, -16 * scale, 4 * scale, 24 * scale)
  // tip
  ctx.fillStyle = '#d7dde4'
  ctx.beginPath()
  ctx.moveTo(0, -16 * scale)
  ctx.lineTo(-2.6 * scale, -8 * scale)
  ctx.lineTo(2.6 * scale, -8 * scale)
  ctx.closePath()
  ctx.fill()
  // flights
  ctx.fillStyle = c.flight
  for (const dir of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(dir * 1.5 * scale, 8 * scale)
    ctx.lineTo(dir * 10 * scale, 17 * scale)
    ctx.lineTo(dir * 1.5 * scale, 15 * scale)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/** Draw a stack of preview blocks for the NimStack card. */
export function drawStackPreview(ctx, hue, w, h) {
  ctx.clearRect(0, 0, w, h)
  const bw = 40
  const bh = 11
  const cx = w / 2
  const baseY = h - 14
  const blocks = [
    { x: cx, w: bw },
    { x: cx - 3, w: bw - 4 },
    { x: cx + 2, w: bw - 9 },
  ]
  blocks.forEach((b, i) => {
    const y = baseY - i * (bh + 2)
    ctx.fillStyle = `hsl(${hue + i * 6}, 48%, ${52 + i * 4}%)`
    ctx.fillRect(b.x - b.w / 2, y - bh, b.w, bh)
    ctx.fillStyle = `hsl(${hue + i * 6}, 52%, ${62 + i * 3}%)`
    ctx.fillRect(b.x - b.w / 2, y - bh, b.w, 3)
  })
  // moving block
  ctx.fillStyle = `hsla(${hue + 12}, 48%, 56%, 0.85)`
  ctx.fillRect(cx - 26, baseY - 3 * (bh + 2) - bh, bw - 12, bh)
}
