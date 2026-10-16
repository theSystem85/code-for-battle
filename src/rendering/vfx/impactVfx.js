// Cosmetic PRNG: never consumes the deterministic simulation random stream.
import { TILE_SIZE } from '../../config.js'

export const MAX_IMPACT_PARTICLES = 384
export const MOBILE_IMPACT_PARTICLES = 128
const COLORS = ['#ffe3a0', '#8b7053', '#ff8d27', '#65605a', '#ffad43']
let rendererSerial = 0

export function selectImpactProfile(type) {
  switch (type) {
    case 'm2': case 'bradley': case 'm2Bradley': case 'bradleyM2': return 'sparky'
    case 'tank': case 'tank_v1': case 'tank-v2': case 'tank-v3':
    case 'tank_v2': case 'tank_v3': return 'blasty'
    default: return 'default'
  }
}

export function createImpactVisual(x, y, now, radius, shooter, projectile, surface) {
  const target = projectile?.target
  const projectileProfile = selectImpactProfile(projectile?.originType || projectile?.projectileType)
  return {
    x, y, startTime: now, duration: 500, maxRadius: radius,
    impactProfile: projectileProfile === 'default' ? selectImpactProfile(shooter?.type) : projectileProfile,
    impactAngle: Math.atan2(projectile?.vy ?? projectile?.dy ?? y - (shooter?.y ?? y), projectile?.vx ?? projectile?.dx ?? x - (shooter?.x ?? x)) + Math.PI,
    impactSurface: surface || (target ? (target.width ? 'building' : 'unit') : 'ground'),
    visualSeed: (Math.random() * 0xffffffff) >>> 0
  }
}

export function isLowImpactQuality(state) {
  const body = typeof document === 'undefined' ? null : document.body
  return Boolean(state?.lowEnd || state?.graphicsQuality === 'low' ||
    body?.classList.contains('is-touch') || body?.classList.contains('mobile-landscape') ||
    body?.classList.contains('mobile-portrait') ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0))
}

// Shared, bounded resource. Preparation runs before gameplay or on an explicit
// display resize, never from emit/render. Swap only after the new sprite is ready.
let flashCanvas = null
let flashDpr = 0
export function prepareImpactFlash(dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1) {
  if (flashDpr === dpr) return flashCanvas
  if (typeof document === 'undefined' || !Number.isFinite(dpr) || dpr <= 0 || dpr > 4) {
    flashCanvas = null
    flashDpr = dpr
    return null
  }
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.ceil(48 * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const r = canvas.width / 2
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r)
  gradient.addColorStop(0, 'rgba(255,221,167,0.65)')
  gradient.addColorStop(0.4, 'rgba(255,183,105,0.2)')
  gradient.addColorStop(1, 'rgba(255,183,105,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  flashCanvas = canvas
  flashDpr = dpr
  return canvas
}

function prepareImpactDisplayChange() {
  if (flashDpr > 0) prepareImpactFlash()
}
if (typeof window !== 'undefined') window.addEventListener('resize', prepareImpactDisplayChange)

export class ImpactVfx {
  constructor() {
    this.serial = ++rendererSerial
    this.particles = Array.from({ length: MAX_IMPACT_PARTICLES }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, start: 0, life: 0, size: 0, angle: 0, kind: 0, stretch: 1
    }))
    this.cursor = 0
    this.seed = 1
    this.lastTime = -1
    this.activeUntil = 0
    this.prepare()
  }

  prepare(dpr) {
    return prepareImpactFlash(dpr)
  }

  get flash() { return flashCanvas }
  get dpr() { return flashDpr }

  random() {
    this.seed ^= this.seed << 13
    this.seed ^= this.seed >>> 17
    this.seed ^= this.seed << 5
    return (this.seed >>> 0) / 4294967296
  }

  emit(exp, now, low) {
    const start = exp.loop && exp.duration > 0
      ? exp.startTime + Math.floor(Math.max(0, now - exp.startTime) / exp.duration) * exp.duration
      : exp.startTime
    if (now < start) return
    // Same object can be replayed by the existing looping benchmark fixture.
    if (exp.vfxSerial === this.serial && exp.vfxStart === start) return
    exp.vfxSerial = this.serial
    exp.vfxStart = start
    const age = now - start
    if (age < 0 || age > 1500) return
    this.seed = exp.visualSeed || ((exp.x * 73856093 ^ exp.y * 19349663 ^ exp.startTime) >>> 0) || 1
    const sparky = exp.impactProfile === 'sparky'
    const blasty = exp.impactProfile === 'blasty'
    const count = Math.floor((sparky ? 22 : blasty ? 28 : 16) * (0.75 + this.random() * 0.5) * (low ? 0.4 : 1))
    const cap = low ? MOBILE_IMPACT_PARTICLES : MAX_IMPACT_PARTICLES
    const reverse = exp.impactAngle || 0
    const spread = !exp.impactSurface || exp.impactSurface === 'ground' ? 2.6 : 1.2
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor++ % cap]
      p.kind = i === 0 ? 4 : sparky ? 0 : i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : i % 2 === 0 ? 1 : 0
      const angle = reverse + (this.random() - 0.5) * spread
      const speed = p.kind === 3 ? 5 + this.random() * 10 : 25 + this.random() * (sparky ? 180 : 95)
      p.x = exp.x
      p.y = exp.y
      p.vx = p.kind === 4 ? 0 : Math.cos(angle) * speed
      p.vy = p.kind === 4 ? 0 : Math.sin(angle) * speed - (p.kind === 3 ? 15 : 0)
      p.start = start + (i === 0 ? 0 : this.random() * 65)
      p.life = p.kind === 4 ? 120 + this.random() * 80 : p.kind === 3 ? 850 + this.random() * 600 : p.kind === 2 ? 400 + this.random() * 400 : 100 + this.random() * (sparky ? 160 : 400)
      this.activeUntil = Math.max(this.activeUntil, p.start + p.life)
      p.size = p.kind === 3 ? 5 + this.random() * 7 : p.kind === 4 ? (sparky ? 2 + this.random() * 2 : Math.min(24, Math.max(8, (Number.isFinite(exp.maxRadius) ? exp.maxRadius : TILE_SIZE) * 0.4)) * (0.7 + this.random() * 0.3)) : 1 + this.random() * 2
      p.angle = this.random() * Math.PI * 2
      p.stretch = 0.55 + this.random() * 0.6
    }
  }

  beginFrame(now) {
    if (now < this.lastTime) {
      for (let i = 0; i < MAX_IMPACT_PARTICLES; i++) this.particles[i].life = 0
      this.serial = ++rendererSerial
      this.activeUntil = 0
    }
    this.lastTime = now
  }

  render(ctx, state, scroll, now, width, height) {
    if (now >= this.activeUntil) return
    const low = isLowImpactQuality(state)
    const cap = low ? MOBILE_IMPACT_PARTICLES : MAX_IMPACT_PARTICLES
    const alpha = ctx.globalAlpha
    const operation = ctx.globalCompositeOperation
    const fill = ctx.fillStyle
    const stroke = ctx.strokeStyle
    const lineWidth = ctx.lineWidth
    for (let i = 0; i < MAX_IMPACT_PARTICLES; i++) {
      const p = this.particles[i]
      if (i >= cap) { p.life = 0; continue }
      const age = now - p.start
      if (age < 0 || age >= p.life) continue
      const t = age / 1000
      const fade = 1 - age / p.life
      const x = p.x + p.vx * t - scroll.x
      const y = p.y + p.vy * t + (p.kind === 1 ? 65 * t * t : 0) - scroll.y
      if (x < -24 || y < -24 || x > width + 24 || y > height + 24) continue
      if (state.shadowOfWarEnabled && !state.visibilityMap?.[Math.floor((y + scroll.y) / TILE_SIZE)]?.[Math.floor((x + scroll.x) / TILE_SIZE)]?.visible) continue
      ctx.globalAlpha = fade * (p.kind === 3 ? 0.22 : 0.85)
      ctx.fillStyle = COLORS[p.kind]
      if (p.kind === 4) {
        // Subtle 120–200 ms soft brightness pulse, not a shockwave ring.
        // Density changes suppress the raster until explicit preparation.
        if (!low && this.flash && this.dpr === ((typeof window !== 'undefined' && window.devicePixelRatio) || 1)) {
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = fade * 0.22
          ctx.drawImage(this.flash, p.x - scroll.x - 24, p.y - scroll.y - 24, 48, 48)
          ctx.globalCompositeOperation = operation
        }
        ctx.globalAlpha = fade * 0.9
        ctx.beginPath()
        ctx.arc(p.x - scroll.x, p.y - scroll.y, p.size * (0.5 + fade * 0.5), 0, Math.PI * 2)
        ctx.fill()
        // Compact hot core makes tank flashes read as fire, without another
        // bitmap layer or a large translucent fill.
        ctx.globalAlpha = fade * fade
        ctx.fillStyle = '#fff0b0'
        ctx.beginPath()
        ctx.arc(p.x - scroll.x, p.y - scroll.y, p.size * 0.35 * fade, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.kind === 0) {
        ctx.strokeStyle = COLORS[0]
        ctx.lineWidth = p.size * fade
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x - p.vx * 0.025 * fade, y - p.vy * 0.025 * fade)
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.ellipse(x, y, p.size, p.size * p.stretch, p.angle, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth
    ctx.globalAlpha = alpha
    ctx.globalCompositeOperation = operation
  }
}
