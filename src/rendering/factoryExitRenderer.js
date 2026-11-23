import { TILE_SIZE } from '../config.js'

// Prepared with the sprite registry, then swapped atomically with its DPR generation.
// A 16-pixel glow uses 9 KiB at DPR 3; factory shading uses the original artwork.
export function prepareFactoryExitSprites(registry, assetVersion) {
  if (typeof document === 'undefined') return
  const prefix = `${assetVersion}@${Math.round(registry.density * 1000) / 1000}:building:`
  if (registry.get(`${prefix}planeFactory:base`)) prepareHangarShadow(registry)
  if (!registry.get(`${prefix}vehicleFactory:base`)) return
  const glow = makeExitEffect(registry, 'factoryExit:glow', 16, 16)
  const light = glow.createRadialGradient(8, 8, 0, 8, 8, 8)
  light.addColorStop(0, 'rgba(255,240,192,0.9)')
  light.addColorStop(0.35, 'rgba(255,227,153,0.4)')
  light.addColorStop(1, 'rgba(255,227,153,0)')
  glow.fillStyle = light
  glow.fillRect(0, 0, 16, 16)
}

function makeExitEffect(registry, key, width, height) {
  const density = registry.density
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * density)
  canvas.height = Math.ceil(height * density)
  registry.register(key, canvas, { decodedBytes: canvas.width * canvas.height * 4, dispose: image => { image.width = image.height = 0 } })
  const ctx = canvas.getContext('2d')
  ctx.scale(density, density)
  return ctx
}

// The half-size coordinates match the doorway in the 192px hangar sprite.
// A small prepared alpha layer extends the existing artwork's interior shade over the aircraft.
const HANGAR_SHADOW_X = 16
const HANGAR_SHADOW_Y = 41
const HANGAR_SHADOW_WIDTH = 24
const HANGAR_SHADOW_HEIGHT = 28
function prepareHangarShadow(registry) {
  const ctx = makeExitEffect(registry, 'factoryExit:hangarShadow', HANGAR_SHADOW_WIDTH, HANGAR_SHADOW_HEIGHT)
  const shade = ctx.createLinearGradient(17, 7, 5, 25)
  shade.addColorStop(0, 'rgba(8,8,8,0.62)')
  shade.addColorStop(1, 'rgba(8,8,8,0)')
  ctx.beginPath()
  ctx.moveTo(2, 1)
  ctx.lineTo(23, 14)
  ctx.lineTo(23, 28)
  ctx.lineTo(2, 16)
  ctx.closePath()
  ctx.fillStyle = shade
  ctx.fill()
}

export function renderFactoryExitEffects(ctx, unit, scroll, registry) {
  const state = unit.factoryExit
  if (!state) return
  const progress = state.elapsed / state.duration
  if (state.planeFactory) {
    if (progress >= 0.55) return
    const shade = registry?.get('factoryExit:hangarShadow')
    if (shade) {
      ctx.globalAlpha *= Math.min(1, (0.55 - progress) / 0.2)
      ctx.drawImage(shade,
        state.factoryX * TILE_SIZE - scroll.x + HANGAR_SHADOW_X,
        state.factoryY * TILE_SIZE - scroll.y + HANGAR_SHADOW_Y,
        HANGAR_SHADOW_WIDTH, HANGAR_SHADOW_HEIGHT)
    }
    return
  }
  const x = unit.x - scroll.x
  const y = unit.y - scroll.y
  ctx.save()
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
const HANGAR_BODY_OUTLINE = [[22, 76], [106, 23], [118, 22], [158, 65], [171, 73], [171, 109], [97, 149], [77, 139], [77, 109], [36, 84], [36, 113], [24, 112]]

export function clipOutsideFactoryBody(ctx, unit, scroll) {
  const state = unit.factoryExit
  if (!state) return false
  const originX = state.factoryX * TILE_SIZE - scroll.x
  const originY = state.factoryY * TILE_SIZE - scroll.y
  const scale = (TILE_SIZE * 3) / 192
  ctx.beginPath()
  // The even-odd exterior must enclose the whole building polygon.
  ctx.rect(originX - TILE_SIZE * 2, originY - TILE_SIZE, TILE_SIZE * 7, TILE_SIZE * 7)
  const outline = state.planeFactory ? HANGAR_BODY_OUTLINE : FACTORY_BODY_OUTLINE
  outline.forEach(([px, py], index) => {
    const x = originX + px * scale
    const y = originY + py * scale
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.clip('evenodd')
  return true
}
