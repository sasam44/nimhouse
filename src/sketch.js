/**
 * Shared canvas art helpers — cheerful cartoon "fake-3D" style.
 * Bold outlines, gradients, highlights, soft shading. No game state here.
 */

/** rounded-rect path (manual — avoids ctx.roundRect compat issues) */
export function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.lineTo(x + w - rad, y)
  ctx.arcTo(x + w, y, x + w, y + rad, rad)
  ctx.lineTo(x + w, y + h - rad)
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad)
  ctx.lineTo(x + rad, y + h)
  ctx.arcTo(x, y + h, x, y + h - rad, rad)
  ctx.lineTo(x, y + rad)
  ctx.arcTo(x, y, x + rad, y, rad)
  ctx.closePath()
}

function shade(hex, f) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f))
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f))
  const b = Math.min(255, Math.round((n & 255) * f))
  return `rgb(${r},${g},${b})`
}

/**
 * Draw the absurd NimHouse chicken (cute cartoon style).
 * @param flap wing animation phase (radians)
 * @param rot body rotation
 */
export function drawChicken(ctx, x, y, s, skin, t = 0, flap = 0, rot = 0) {
  const c = skin.colors
  const out = 'rgba(96,56,18,0.38)'
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.lineJoin = 'round'

  // tail feathers (rounded, bobbing)
  ctx.fillStyle = c.wing
  for (let i = -1; i <= 1; i++) {
    ctx.save()
    ctx.translate(-12 * s, i * 4 * s)
    ctx.rotate(-0.55 + i * 0.3 + Math.sin(t * 4 + i) * 0.1)
    ctx.beginPath()
    ctx.ellipse(-7 * s, 0, 8.5 * s, 3.6 * s, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = out
    ctx.lineWidth = 1.2 * s
    ctx.stroke()
    ctx.restore()
  }

  // body
  ctx.fillStyle = c.body
  ctx.beginPath()
  ctx.ellipse(0, 0, 16 * s, 14 * s, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = out
  ctx.lineWidth = 1.7 * s
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.beginPath()
  ctx.ellipse(-4 * s, -6.5 * s, 7 * s, 4.2 * s, -0.4, 0, Math.PI * 2)
  ctx.fill()

  // wing
  ctx.save()
  ctx.translate(-3 * s, 1 * s)
  ctx.rotate(-0.4 + Math.sin(flap) * 0.6)
  ctx.fillStyle = c.wing
  ctx.beginPath()
  ctx.ellipse(-6 * s, 2 * s, 9.5 * s, 5.6 * s, 0.35, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = out
  ctx.lineWidth = 1.4 * s
  ctx.stroke()
  ctx.strokeStyle = 'rgba(0,0,0,0.14)'
  ctx.lineWidth = 1 * s
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.moveTo((-1.5 - i * 2.6) * s, (0 + i * 1.4) * s)
    ctx.lineTo((-8.5 - i * 1.4) * s, (1.2 + i * 1.4) * s)
    ctx.stroke()
  }
  ctx.restore()

  // head (bigger = cuter)
  ctx.fillStyle = c.body
  ctx.beginPath()
  ctx.arc(12 * s, -13 * s, 11.5 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = out
  ctx.lineWidth = 1.7 * s
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.beginPath()
  ctx.ellipse(8.5 * s, -18 * s, 4.5 * s, 2.8 * s, -0.5, 0, Math.PI * 2)
  ctx.fill()

  // comb
  ctx.fillStyle = c.comb
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc((7.5 + i * 4.5) * s, -24 * s - (i === 1 ? 2.5 * s : 0), 3 * s, 0, Math.PI * 2)
    ctx.fill()
  }

  // beak
  ctx.fillStyle = c.beak
  ctx.beginPath()
  ctx.moveTo(21.5 * s, -16.5 * s)
  ctx.lineTo(30.5 * s, -13 * s)
  ctx.lineTo(21.5 * s, -11 * s)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = out
  ctx.lineWidth = 1.2 * s
  ctx.stroke()
  ctx.fillStyle = shade(c.beak, 0.75)
  ctx.beginPath()
  ctx.moveTo(21.5 * s, -10.5 * s)
  ctx.lineTo(28.5 * s, -9 * s)
  ctx.lineTo(21.5 * s, -8 * s)
  ctx.closePath()
  ctx.fill()

  // blush (cheerful)
  ctx.fillStyle = 'rgba(255,120,140,0.4)'
  ctx.beginPath()
  ctx.arc(16.5 * s, -8.5 * s, 2.7 * s, 0, Math.PI * 2)
  ctx.fill()

  // googly eye
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(15.5 * s, -15 * s, 4.8 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = out
  ctx.lineWidth = 1.2 * s
  ctx.stroke()
  ctx.fillStyle = '#222'
  const px = 15.5 * s + Math.sin(t * 2.2) * 1.3 * s
  const py = -15 * s + Math.cos(t * 1.7) * 1.1 * s
  ctx.beginPath()
  ctx.arc(px, py, 2.2 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(px - 0.8 * s, py - 0.8 * s, 0.75 * s, 0, Math.PI * 2)
  ctx.fill()

  // absurd mustache
  ctx.strokeStyle = c.mustache
  ctx.lineWidth = 1.8 * s
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(24.5 * s, -7.5 * s)
  ctx.quadraticCurveTo(27.5 * s, -9.5 * s, 29.8 * s, -7.5 * s)
  ctx.moveTo(24.5 * s, -6.5 * s)
  ctx.quadraticCurveTo(27 * s, -4.8 * s, 29.3 * s, -5.8 * s)
  ctx.stroke()

  // accessories
  if (skin.accessory === 'helmet') {
    ctx.fillStyle = 'rgba(185,225,255,0.85)'
    ctx.beginPath()
    ctx.arc(12 * s, -13 * s, 13 * s, Math.PI * 0.92, Math.PI * 2.08)
    ctx.fill()
    ctx.strokeStyle = 'rgba(80,140,200,0.5)'
    ctx.lineWidth = 1.5 * s
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.beginPath()
    ctx.ellipse(8.5 * s, -19 * s, 4 * s, 1.8 * s, -0.5, 0, Math.PI * 2)
    ctx.fill()
  } else if (skin.accessory === 'sunglasses') {
    ctx.fillStyle = '#141414'
    rr(ctx, 10 * s, -19 * s, 7 * s, 5.4 * s, 2 * s)
    ctx.fill()
    rr(ctx, 18.5 * s, -19 * s, 7 * s, 5.4 * s, 2 * s)
    ctx.fill()
    ctx.fillRect(16.5 * s, -17.8 * s, 2.5 * s, 1.4 * s)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillRect(11 * s, -18.3 * s, 2 * s, 1 * s)
  } else if (skin.accessory === 'crown') {
    ctx.fillStyle = '#ffd23f'
    ctx.beginPath()
    ctx.moveTo(6 * s, -25 * s)
    ctx.lineTo(8 * s, -31 * s)
    ctx.lineTo(11 * s, -26.5 * s)
    ctx.lineTo(13.5 * s, -32 * s)
    ctx.lineTo(16 * s, -26.5 * s)
    ctx.lineTo(19 * s, -31 * s)
    ctx.lineTo(20.5 * s, -25 * s)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(140,90,0,0.5)'
    ctx.lineWidth = 1.2 * s
    ctx.stroke()
    ctx.fillStyle = '#e63946'
    ctx.beginPath()
    ctx.arc(13.5 * s, -28 * s, 1.4 * s, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

/**
 * Draw a dart with the TIP at local (0, -24*scale) pointing up.
 * `angle` rotates it. Cartoon shading included.
 */
export function drawDart(ctx, x, y, angle, skin, scale = 1) {
  const c = skin.colors
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)

  // barrel (cylindrical gradient)
  const g = ctx.createLinearGradient(-2.6 * scale, 0, 2.6 * scale, 0)
  g.addColorStop(0, shade(c.barrel, 1.3))
  g.addColorStop(0.45, c.barrel)
  g.addColorStop(1, shade(c.barrel, 0.55))
  ctx.fillStyle = g
  rr(ctx, -2.6 * scale, -16 * scale, 5.2 * scale, 24 * scale, 2.4 * scale)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1 * scale
  ctx.stroke()

  // metallic tip (top)
  ctx.fillStyle = '#eef2f6'
  ctx.beginPath()
  ctx.moveTo(0, -24.5 * scale)
  ctx.lineTo(-2.4 * scale, -15.5 * scale)
  ctx.lineTo(0, -15.5 * scale)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#9aa7b4'
  ctx.beginPath()
  ctx.moveTo(0, -24.5 * scale)
  ctx.lineTo(2.4 * scale, -15.5 * scale)
  ctx.lineTo(0, -15.5 * scale)
  ctx.closePath()
  ctx.fill()

  // flights
  for (const dir of [-1, 1]) {
    ctx.fillStyle = c.flight
    ctx.beginPath()
    ctx.moveTo(dir * 1.5 * scale, 7.5 * scale)
    ctx.quadraticCurveTo(dir * 11.5 * scale, 9 * scale, dir * 9 * scale, 20 * scale)
    ctx.quadraticCurveTo(dir * 4.5 * scale, 16.5 * scale, dir * 1.5 * scale, 13.5 * scale)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1 * scale
    ctx.stroke()
  }

  // tail cork
  ctx.fillStyle = '#c98a4b'
  rr(ctx, -3.2 * scale, 13.5 * scale, 6.4 * scale, 4.5 * scale, 1.6 * scale)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 1 * scale
  ctx.stroke()

  ctx.restore()
}

/**
 * Pseudo-3D block (front + top + right faces).
 * `y` = top of the front face; `h` = front face height.
 * `squash` 0..1 compresses vertically (bottom stays fixed).
 */
export function drawBlock3D(ctx, x, y, w, hue, h = 26, squash = 0) {
  const hh = h * (1 - 0.2 * squash)
  const yTop = y + (h - hh)
  const d = 7 // depth offset
  const top = `hsl(${hue}, 64%, 68%)`
  const front = `hsl(${hue}, 56%, 52%)`
  const side = `hsl(${hue}, 44%, 36%)`

  // top face
  ctx.fillStyle = top
  ctx.beginPath()
  ctx.moveTo(x, yTop)
  ctx.lineTo(x + d, yTop - d)
  ctx.lineTo(x + w + d, yTop - d)
  ctx.lineTo(x + w, yTop)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = 1
  ctx.stroke()

  // right side face
  ctx.fillStyle = side
  ctx.beginPath()
  ctx.moveTo(x + w, yTop)
  ctx.lineTo(x + w + d, yTop - d)
  ctx.lineTo(x + w + d, yTop - d + hh)
  ctx.lineTo(x + w, yTop + hh)
  ctx.closePath()
  ctx.fill()

  // front face
  ctx.fillStyle = front
  ctx.fillRect(x, yTop, w, hh)
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.fillRect(x, yTop, w, 3.5)
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.fillRect(x, yTop + hh - 4, w, 4)
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, yTop + 0.5, w - 1, hh - 1)
}

/** Mini dartboard with a dart in the bullseye (NimBullseye card thumbnail). */
export function drawBoardPreview(ctx, w, h, dartSkin) {
  ctx.clearRect(0, 0, w, h)
  const cx = w / 2
  const cy = h / 2 - 2
  const R = 28
  // wooden frame
  const wood = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R)
  wood.addColorStop(0, '#b06a2c')
  wood.addColorStop(1, '#6e3f16')
  ctx.fillStyle = wood
  ctx.beginPath()
  ctx.arc(cx, cy, R + 4, 0, Math.PI * 2)
  ctx.fill()
  const mini = [
    { r: 28, c: '#2f3542' },
    { r: 23, c: '#ef476f' },
    { r: 17.5, c: '#06d6a0' },
    { r: 12, c: '#ef476f' },
    { r: 6.5, c: '#06d6a0' },
    { r: 3, c: '#ffd60a' },
  ]
  for (const r of mini) {
    ctx.fillStyle = r.c
    ctx.beginPath()
    ctx.arc(cx, cy, r.r, 0, Math.PI * 2)
    ctx.fill()
  }
  // dome highlight
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.beginPath()
  ctx.arc(cx - 7, cy - 9, R * 0.72, 0, Math.PI * 2)
  ctx.fill()
  // dart pinned in the bullseye (tip at center)
  if (dartSkin) drawDart(ctx, cx, cy + 24 * 0.55, 0, dartSkin, 0.55)
}

/** Small stack of blocks (card / skin thumbnail). */
export function drawStackPreview(ctx, hue, w, h) {
  ctx.clearRect(0, 0, w, h)
  const baseY = h - 8
  const blocks = [
    { x: (w - 40) / 2, w: 40 },
    { x: (w - 34) / 2, w: 34 },
    { x: (w - 28) / 2 + 3, w: 28 },
  ]
  blocks.forEach((b, i) => {
    drawBlock3D(ctx, b.x, baseY - (i + 1) * 12, b.w, hue + i * 5, 12, 0)
  })
  // floating block above (the new drop mechanic)
  drawBlock3D(ctx, (w - 24) / 2 + 12, baseY - 4 * 12 - 6, 24, hue + 20, 12, 0)
}

/** Cute sun with a face. */
export function drawSun(ctx, x, y, r) {
  ctx.save()
  ctx.strokeStyle = '#ffc300'
  ctx.lineWidth = r * 0.22
  ctx.lineCap = 'round'
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(a) * (r + r * 0.22), y + Math.sin(a) * (r + r * 0.22))
    ctx.lineTo(x + Math.cos(a) * (r + r * 0.5), y + Math.sin(a) * (r + r * 0.5))
    ctx.stroke()
  }
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r)
  g.addColorStop(0, '#ffe97a')
  g.addColorStop(1, '#ffcc33')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  // happy closed eyes + smile
  ctx.strokeStyle = '#e8940a'
  ctx.lineWidth = r * 0.13
  ctx.beginPath()
  ctx.arc(x - r * 0.32, y - r * 0.08, r * 0.18, Math.PI * 1.1, Math.PI * 1.9)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x + r * 0.32, y - r * 0.08, r * 0.18, Math.PI * 1.1, Math.PI * 1.9)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y + r * 0.15, r * 0.34, Math.PI * 0.15, Math.PI * 0.85)
  ctx.stroke()
  ctx.restore()
}

/** Fluffy cartoon cloud. */
export function drawCloud(ctx, x, y, s) {
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(x, y, 14 * s, 0, Math.PI * 2)
  ctx.arc(x + 16 * s, y + 3 * s, 11 * s, 0, Math.PI * 2)
  ctx.arc(x - 15 * s, y + 4 * s, 10 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(160,210,255,0.5)'
  ctx.beginPath()
  ctx.ellipse(x, y + 9 * s, 22 * s, 5 * s, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
