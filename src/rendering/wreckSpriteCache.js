import { TILE_SIZE } from '../config.js'
import { getNavalSpriteLengthTiles } from '../utils/navalUtils.js'
import { loadPreparedImage } from './prepared/imagePreparation.js'
import { getPreparedSpriteCacheKey } from './prepared/preparedSpritePipeline.js'

const WRECK_RASTER_LIMIT = 16 * 1024 * 1024
const TANK_LAYERS = ['wagon', 'turret', 'barrel']
const WRECK_TANK_VARIANTS = ['tankV1', 'tankV2', 'tankV3', 'lightTank']
const wrecksByRegistry = new WeakMap()

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function desaturate(image) {
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue
    const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    const amplitude = Math.sin((i / 4 + 1) * 12.9898 + luminance * 78.233)
    const noise = (amplitude - Math.floor(amplitude)) * 2 - 1
    const value = Math.min(255, Math.max(0, luminance + noise * 18))
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function releaseCanvas(sprite) {
  sprite.image.width = 0
  sprite.image.height = 0
}

function isStandaloneWreckSource(id) {
  return (id.startsWith('unit:') && id.endsWith(':base')) ||
    (id.startsWith('naval:') && id.endsWith(':hull')) ||
    id === 'aircraft:f22:flight' || id === 'aircraft:f35:flight'
}

export function isWreckSourceEntry({ id }) {
  return isStandaloneWreckSource(id) || WRECK_TANK_VARIANTS.some(type => id.startsWith(`unit:${type}:`))
}

export function getWreckSprites(registry) {
  return registry && !registry.disposed ? wrecksByRegistry.get(registry) : null
}

export async function prepareWreckSprites({ manifest, registry, density }, { signal, loadImage = loadPreparedImage } = {}) {
  const sprites = { tanks: new Map(), singles: new Map(), sinking: new Map(), bytes: 0 }
  const register = (id, image, logicalWidth, logicalHeight) => {
    const decodedBytes = image.width * image.height * 4
    if (sprites.bytes + decodedBytes > WRECK_RASTER_LIMIT) {
      releaseCanvas({ image })
      throw new Error('Wreck sprite byte budget exceeded')
    }
    const sprite = { image, logicalWidth, logicalHeight }
    try {
      registry.register(`wreck:${id}`, sprite, { decodedBytes, dispose: releaseCanvas })
    } catch (error) {
      releaseCanvas(sprite)
      throw error
    }
    sprites.bytes += decodedBytes
    return sprite
  }

  for (const tank of WRECK_TANK_VARIANTS) {
    const images = {}
    for (const layer of TANK_LAYERS) {
      const id = `unit:${tank}:${layer}`
      const source = registry.get(getPreparedSpriteCacheKey(manifest.assetVersion, density, id))
      if (!source) break
      images[layer] = register(id, desaturate(source.image), source.logicalWidth, source.logicalHeight).image
    }
    if (images.barrel) sprites.tanks.set(tank, images)
  }

  const entries = manifest.entries.filter(({ id }) => isStandaloneWreckSource(id))
  // Keep only four source decodes in flight. Original-size grayscale canvases
  // are scratch storage, released as soon as the final-size sprite is ready.
  for (let start = 0; start < entries.length; start += 4) {
    await Promise.all(entries.slice(start, start + 4).map(async entry => {
      let source
      try {
        source = await loadImage(entry.source, { signal })
      } catch (error) {
        if (signal?.aborted) throw error
        if (registry.disposed) return
        // Offline installations already cache the prepared density variants.
        source = registry.get(getPreparedSpriteCacheKey(manifest.assetVersion, density, entry.id))?.image
        if (!source) {
          console.warn(`Wreck source unavailable: ${entry.id}`, error)
          return
        }
      }
      if (signal?.aborted || registry.disposed) return
      const [category, name] = entry.id.split(':')
      const type = name === 'f22' ? 'f22Raptor' : name
      const sinking = category === 'naval'
      const length = sinking ? (type === 'supplyShip' ? 2.2 : getNavalSpriteLengthTiles(type)) : 1
      const scale = length * TILE_SIZE / Math.max(source.width, source.height)
      const logicalWidth = source.width * scale
      const logicalHeight = source.height * scale
      const gray = sinking ? null : desaturate(source)
      const final = createCanvas(Math.max(1, Math.round(logicalWidth * density)), Math.max(1, Math.round(logicalHeight * density)))
      final.getContext('2d').drawImage(gray || source, 0, 0, final.width, final.height)
      if (gray) releaseCanvas({ image: gray })
      const sprite = register(entry.id, final, logicalWidth, logicalHeight)
      const target = sinking ? sprites.sinking : sprites.singles
      target.set(type, sprite)
    }))
  }

  if (!registry.disposed && !signal?.aborted) {
    const logicalSize = TILE_SIZE * 1.2
    const size = Math.max(1, Math.round(logicalSize * density))
    const noise = createCanvas(size, size)
    const ctx = noise.getContext('2d')
    const pixels = ctx.createImageData(size, size)
    // Normal wrecks have string seed keys, which produced black RGB in the
    // original numeric noise formula. Saved numeric keys keep that formula.
    for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 60
    ctx.putImageData(pixels, 0, 0)
    sprites.noise = register('noise', noise, logicalSize, logicalSize).image
    wrecksByRegistry.set(registry, sprites)
  }
  return sprites
}
