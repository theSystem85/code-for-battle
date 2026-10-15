import { TILE_SIZE } from '../config.js'

// Prepared with the sprite registry, then swapped atomically with its DPR generation.
// Two factory-sized RGBA surfaces and a tiny glow: < 0.7 MiB at DPR 3.
export function prepareFactoryExitSprites(registry, assetVersion) {
  const sprite = registry.get(`${assetVersion}@${Math.round(registry.density * 1000) / 1000}:building:vehicleFactory:base`)
  if (!sprite || typeof document === 'undefined') return
  const size = TILE_SIZE * 3
  const density = registry.density
  const make = (key, logicalSize = size) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = Math.ceil(logicalSize * density)
    registry.register(key, canvas, { decodedBytes: canvas.width * canvas.height * 4, dispose: image => { image.width = image.height = 0 } })
    const ctx = canvas.getContext('2d')
    ctx.scale(density, density)
    return ctx
  }
  const interior = make('factoryExit:interior')
  interior.beginPath()
  interior.moveTo(size * 61 / 192, size * 88 / 192)
  interior.lineTo(size * 96 / 192, size * 108 / 192)
  interior.lineTo(size * 96 / 192, size * 142 / 192)
  interior.lineTo(size * 61 / 192, size * 122 / 192)
  interior.closePath()
  const gradient = interior.createLinearGradient(size * 0.5, size * 0.4, size * 0.3, size * 0.7)
  gradient.addColorStop(0, '#030405')
  gradient.addColorStop(1, '#252424')
  interior.fillStyle = gradient
  interior.fill()
  const shadow = make('factoryExit:shadow')
  const image = sprite.image || sprite.canvas || sprite
  const rect = sprite.sourceRect
  shadow.transform(1, 0.12, 0.18, 1, 3, 4)
  if (rect) shadow.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, size, size)
  else shadow.drawImage(image, 0, 0, size, size)
  shadow.globalCompositeOperation = 'source-in'
  shadow.fillStyle = '#000'
  shadow.fillRect(-size, -size, size * 3, size * 3)
  const glow = make('factoryExit:glow', 16)
  const light = glow.createRadialGradient(8, 8, 0, 8, 8, 8)
  light.addColorStop(0, 'rgba(255,240,192,0.9)')
  light.addColorStop(0.35, 'rgba(255,227,153,0.4)')
  light.addColorStop(1, 'rgba(255,227,153,0)')
  glow.fillStyle = light
  glow.fillRect(0, 0, 16, 16)
}

export function renderFactoryInterior(ctx, building, scroll, registry) {
  if (building.type !== 'vehicleFactory') return
  const image = registry?.get('factoryExit:interior')
  if (image) ctx.drawImage(image, building.x * TILE_SIZE - scroll.x, building.y * TILE_SIZE - scroll.y, TILE_SIZE * 3, TILE_SIZE * 3)
}

export function renderFactoryExitEffects(ctx, unit, scroll, registry) {
  const state = unit.factoryExit
  if (!state) return
  const progress = state.elapsed / state.duration
  const x = unit.x - scroll.x
  const y = unit.y - scroll.y
  ctx.save()
  // Bounded to a single unit, never the map or weapon range.
  const shadow = registry?.get('factoryExit:shadow')
  if (shadow) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, TILE_SIZE, TILE_SIZE)
    ctx.clip()
    ctx.globalAlpha *= 0.45 * (1 - progress)
    ctx.drawImage(shadow, state.factoryX * TILE_SIZE - scroll.x, state.factoryY * TILE_SIZE - scroll.y, TILE_SIZE * 3, TILE_SIZE * 3)
    ctx.restore()
  }
  if (state.phase === 'moving') {
    ctx.fillStyle = '#b5a18a'
    for (let i = 0; i < 3; i++) {
      const age = ((state.elapsed + i * 137) % 410) / 410
      ctx.globalAlpha = 0.16 * (1 - age) * progress
      ctx.beginPath()
      ctx.arc(x + TILE_SIZE * (0.55 + i * 0.12) + age * 5, y + TILE_SIZE * 0.4 - age * 4, 1 + age * 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#686565'
    ctx.globalAlpha = 0.12 * (1 - progress)
    ctx.beginPath()
    ctx.arc(x + TILE_SIZE * 0.8, y + TILE_SIZE * 0.25, 2, 0, Math.PI * 2)
    ctx.fill()
  }
  if (progress < 0.55) {
    const glow = registry?.get('factoryExit:glow')
    if (glow) {
      ctx.globalAlpha = 0.3 * (1 - progress / 0.55)
      ctx.drawImage(glow, x + TILE_SIZE * 0.25 - 8, y + TILE_SIZE * 0.7 - 8, 16, 16)
    }
  }
  ctx.restore()
}

// Walls and roof of vehicle_factory.webp in 192 px source space. The sprite also paints a
// dirt apron in front of the gate, so only this body may hide an exiting unit.
const FACTORY_BODY_OUTLINE = [[27, 62], [90, 16], [176, 64], [174, 112], [102, 146], [96, 142], [96, 108], [61, 88], [61, 122], [30, 96]]

// Clip to everything except the factory body (the gate opening stays visible), so the
// unit drawn again after the factory shows over the apron but stays hidden behind walls.
export function clipOutsideFactoryBody(ctx, unit, scroll) {
  const state = unit.factoryExit
  if (!state) return false
  const originX = state.factoryX * TILE_SIZE - scroll.x
  const originY = state.factoryY * TILE_SIZE - scroll.y
  const scale = (TILE_SIZE * 3) / 192
  ctx.beginPath()
  ctx.rect(unit.x - scroll.x - TILE_SIZE, unit.y - scroll.y - TILE_SIZE, TILE_SIZE * 3, TILE_SIZE * 3)
  FACTORY_BODY_OUTLINE.forEach(([px, py], index) => {
    const x = originX + px * scale
    const y = originY + py * scale
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.clip('evenodd')
  return true
}
