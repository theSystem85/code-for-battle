import { prepareCliffDescriptor } from '../cliffTerrain.js'
import { biomeTransitionCoverage, shorelineCornerMask, shorelineCoverage, terrainHash } from '../organicTerrain.js'
import { PreparedMap, PreparationGeneration } from './preparedMap.js'
import { RenderByteBudget, RENDER_BYTE_OWNERS } from './renderByteBudget.js'
import { decodePreparedImage, estimateDecodedImageBytes, loadPreparedImage } from './imagePreparation.js'
import { TERRAIN_ASSET_MANIFEST } from './terrainAssetManifest.js'

const TYPE_IDS = Object.freeze({ water: 0, land: 1, street: 2, rock: 3 })
const SOT_TYPE_IDS = Object.freeze({ none: 0, water: 1, street: 2, land: 3, rock: 4 })
const ORIENTATION_IDS = Object.freeze({
  'top-left': 0,
  'top-right': 1,
  'bottom-right': 2,
  'bottom-left': 3
})
const SHORE_SOURCE_OFFSETS = Object.freeze([
  Object.freeze([0, -1]),
  Object.freeze([-1, 0]),
  Object.freeze([1, 0]),
  Object.freeze([0, 1]),
  Object.freeze([-1, -1]),
  Object.freeze([1, -1]),
  Object.freeze([-1, 1]),
  Object.freeze([1, 1])
])
const MASK_RASTER_BYTES_PER_PIXEL = 4

function abortError(reason = 'Terrain preparation aborted') {
  if (reason instanceof globalThis.DOMException && reason.name === 'AbortError') return reason
  return new globalThis.DOMException(String(reason), 'AbortError')
}

function checkedProduct(...values) {
  const product = values.reduce((total, value) => total * value, 1)
  if (!Number.isSafeInteger(product) || product < 0) throw new RangeError('Prepared byte estimate exceeds safe integer range')
  return product
}

function reserveAll(budget, usage) {
  const tokens = []
  try {
    for (const [owner, bytes] of Object.entries(usage)) {
      if (bytes > 0) tokens.push(budget.reserve(owner, bytes))
    }
    return tokens
  } catch (error) {
    for (const token of tokens) token.release()
    throw error
  }
}

function releaseTokens(tokens) {
  for (const token of tokens) token.release()
  tokens.length = 0
}

function makeCanvas(size) {
  if (!globalThis.document?.createElement) return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  return canvas
}

function createAlphaMask(size, coverage, canvasFactory) {
  const canvas = canvasFactory(size)
  const context = canvas?.getContext?.('2d')
  if (!context?.createImageData || !context?.putImageData) return null
  const pixels = context.createImageData(size, size)
  const denominator = Math.max(1, size - 1)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    pixels.data[(y * size + x) * 4 + 3] = Math.round(coverage(x / denominator, y / denominator, x, y) * 255)
  }
  context.putImageData(pixels, 0, 0)
  return canvas
}

function directionalBlendDescriptor(size, density, x, y, blend) {
  const directionSteps = 8
  const direction = ((Math.round((((blend.angle || 0) + Math.PI) / (Math.PI * 2)) * directionSteps) % directionSteps) + directionSteps) % directionSteps
  const coverage = Math.max(1, Math.min(8, Math.round(blend.alpha * 8)))
  const angle = (direction / directionSteps) * Math.PI * 2 - Math.PI
  const normalX = Math.cos(angle)
  const normalY = Math.sin(angle)
  const tangentX = -normalY
  const tangentY = normalX
  const worldTangent = (x * size) * tangentX + (y * size) * tangentY
  const phase = ((Math.round((worldTangent / size) * 2) % 8) + 8) % 8
  const featherPixels = Math.max(1, Math.min(size, Number(blend.featherPixels) || size * 0.2))
  return Object.freeze({
    kind: 'directional-biome',
    key: `biome-directional|${size}|${density}|${direction}|${coverage}|${phase}|${featherPixels}`,
    direction,
    coverage,
    phase,
    featherPixels
  })
}

function directionalBlendCoverage(descriptor, pixelSize, px, py) {
  const angle = (descriptor.direction / 8) * Math.PI * 2 - Math.PI
  const normalX = Math.cos(angle)
  const normalY = Math.sin(angle)
  const tangentX = -normalY
  const tangentY = normalX
  const localX = px + 0.5 - pixelSize / 2
  const localY = py + 0.5 - pixelSize / 2
  const continuousTangent = (localX * tangentX + localY * tangentY) / pixelSize + descriptor.phase / 2
  const wave = Math.sin(continuousTangent * Math.PI * 2) * pixelSize * 0.1 +
    Math.sin(continuousTangent * Math.PI * 5) * pixelSize * 0.035
  const threshold = (descriptor.coverage / 8 - 0.5) * pixelSize * 1.35
  const distance = localX * normalX + localY * normalY + threshold + wave
  return Math.max(0, Math.min(1, 0.5 + distance / Math.max(3, descriptor.featherPixels * descriptor.density)))
}

function exactBlendDescriptor(size, density, blend) {
  const cornerWeights = blend.cornerWeights.map(Number)
  return Object.freeze({
    kind: 'corner-biome',
    key: `biome-corner|${size}|${density}|${cornerWeights.join(':')}`,
    cornerWeights: Object.freeze(cornerWeights)
  })
}

function shorelineDescriptor(size, density, mask, patternVariant) {
  return Object.freeze({
    kind: 'shoreline',
    key: `shore|${size}|${density}|${mask}|0.2|${patternVariant === false ? 'smooth' : patternVariant}`,
    mask,
    patternVariant
  })
}

function rasterizeMask(descriptor, logicalSize, density, canvasFactory) {
  const pixelSize = Math.max(1, Math.round(logicalSize * density))
  if (descriptor.kind === 'corner-biome') {
    return createAlphaMask(pixelSize,
      (u, v) => biomeTransitionCoverage(descriptor.cornerWeights, u, v), canvasFactory)
  }
  if (descriptor.kind === 'shoreline') {
    return createAlphaMask(pixelSize,
      (u, v) => shorelineCoverage(descriptor.mask, u, v, 0.2, descriptor.patternVariant), canvasFactory)
  }
  const atDensity = { ...descriptor, density }
  return createAlphaMask(pixelSize,
    (u, v, px, py) => directionalBlendCoverage(atDensity, pixelSize, px, py), canvasFactory)
}

function imageEntriesToResources(entries) {
  const resources = {
    assets: new Map(),
    biomeImages: { grass: [], soil: [], snow: [], sand: [] }
  }
  for (const { entry, image } of entries) {
    resources.assets.set(entry.key, image)
    if (entry.key.startsWith('biome:')) resources.biomeImages[entry.key.slice(6)]?.push(image)
  }
  resources.image = resources.assets.get('atlas') || null
  resources.details = resources.assets.get('details') || null
  resources.cliffs = resources.assets.get('cliffs') || null
  return resources
}

function descriptorByteLength(descriptors) {
  return descriptors.typeIds.byteLength + descriptors.sotTypes.byteLength +
    descriptors.sotOrientations.byteLength + descriptors.shorelineMasks.byteLength +
    descriptors.biomeIds.byteLength + descriptors.shorelineBiomeIds.byteLength +
    descriptors.shoreMaskDescriptorIds.byteLength +
    descriptors.blendMaskIds.byteLength + descriptors.cliffDepth.values.byteLength +
    descriptors.cliffDepth.plateau.byteLength + descriptors.cliffDepth.heightClass.byteLength +
    descriptors.cliffDepth.rockDepth.byteLength
}

export function estimateAllResidentTerrainBytes(width, height, tileSize, density) {
  const backingTileSize = Math.max(1, Math.round(tileSize * density))
  return checkedProduct(width, height, backingTileSize, backingTileSize, 4)
}

export function createTerrainByteBudget(limits) {
  return new RenderByteBudget(Object.fromEntries(RENDER_BYTE_OWNERS.map(owner => [owner, limits?.[owner]])))
}

export class TerrainPreparationPipeline {
  constructor({
    byteBudget,
    assetLoader,
    canvasFactory = makeCanvas,
    maxAllResidentRasterBytes,
    onPublish,
    onProgress
  } = {}) {
    if (!(byteBudget instanceof RenderByteBudget)) {
      throw new TypeError('Terrain preparation requires an explicit RenderByteBudget')
    }
    this.byteBudget = byteBudget
    this.assetLoader = assetLoader || ((entry, { signal }) => entry.image
      ? decodePreparedImage(entry.image, { signal })
      : loadPreparedImage(entry.src, { signal }))
    this.canvasFactory = canvasFactory
    this.maxAllResidentRasterBytes = maxAllResidentRasterBytes ?? byteBudget.limits.terrainResident
    this.onPublish = onPublish
    this.onProgress = onProgress
    this.current = null
    this.active = null
    this.sequence = 0
    this.lastOptions = null
    this.lastError = null
    this.state = 'idle'
    this.progress = {
      state: 'idle',
      completed: 0,
      total: 0,
      decodedAssets: 0,
      descriptorRows: 0
    }
  }

  updateProgress(values) {
    Object.assign(this.progress, values)
    this.onProgress?.({ ...this.progress })
  }

  getProgress() {
    return { ...this.progress }
  }

  cancel(reason = 'Terrain preparation superseded') {
    this.active?.cancel(reason)
  }

  async retry() {
    if (!this.lastOptions) throw new Error('No terrain preparation is available to retry')
    return this.prepare(this.lastOptions)
  }

  async prepare(options) {
    const {
      grid,
      generation,
      assetGeneration,
      density,
      tileSize,
      sotMask = null,
      assets = TERRAIN_ASSET_MANIFEST,
      signal,
      rasterPageFactory = null,
      gpuStagingBytes = 0,
      transferBytes = 0
    } = options || {}
    if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0]) || !grid[0].length) {
      throw new TypeError('Terrain preparation requires a non-empty rectangular grid')
    }
    const height = grid.length
    const width = grid[0].length
    if (grid.some(row => !Array.isArray(row) || row.length !== width)) throw new TypeError('Terrain grid must be rectangular')
    if (!Number.isInteger(generation) || generation < 0) throw new RangeError('Invalid terrain map generation')
    if (!Number.isInteger(assetGeneration) || assetGeneration < 0) throw new RangeError('Invalid terrain asset generation')
    if (!Number.isFinite(density) || density <= 0) throw new RangeError('Invalid terrain density')
    if (!Number.isFinite(tileSize) || tileSize <= 0) throw new RangeError('Invalid terrain tile size')
    if (!Number.isSafeInteger(gpuStagingBytes) || gpuStagingBytes < 0) throw new RangeError('Invalid GPU staging byte count')
    if (!Number.isSafeInteger(transferBytes) || transferBytes < 0) throw new RangeError('Invalid transfer byte count')
    if (this.current?.isCurrent({ generation, assetGeneration, density })) return this.current

    this.cancel()
    const preparation = new PreparationGeneration(++this.sequence)
    this.active = preparation
    this.lastOptions = options
    this.lastError = null
    this.state = 'preparing'
    const abortFromCaller = () => preparation.cancel(signal.reason || 'Terrain preparation aborted')
    signal?.addEventListener?.('abort', abortFromCaller, { once: true })
    if (signal?.aborted) abortFromCaller()

    const descriptorTotal = height
    this.updateProgress({
      state: 'preparing',
      completed: 0,
      total: assets.length + descriptorTotal,
      decodedAssets: 0,
      descriptorRows: 0
    })

    const reservations = []
    const stagedResources = []
    let failedMap = null
    try {
      const decodedEntries = await Promise.all(assets.map(async(entry) => {
        const image = await this.assetLoader(entry, { signal: preparation.signal })
        preparation.assertCurrent(this.sequence)
        if (!image) throw new Error(`Required terrain asset did not decode: ${entry.key}`)
        this.updateProgress({
          decodedAssets: this.progress.decodedAssets + 1,
          completed: this.progress.completed + 1
        })
        return { entry, image }
      }))
      preparation.assertCurrent(this.sequence)
      const decodedSourceBytes = decodedEntries.reduce((total, item) => total + estimateDecodedImageBytes(item.image), 0)
      reservations.push(...reserveAll(this.byteBudget, { decodedSources: decodedSourceBytes }))

      const typeIds = new Uint8Array(width * height)
      const sotTypes = new Uint8Array(width * height)
      const sotOrientations = new Int8Array(width * height)
      sotOrientations.fill(-1)
      const shorelineMasks = new Uint8Array(width * height)
      const biomeIds = new Uint8Array(width * height)
      const shorelineBiomeIds = new Uint8Array(width * height)
      const shoreMaskDescriptorIds = new Uint32Array(width * height)
      const blendMaskIds = new Uint32Array(width * height)
      const biomeNames = ['']
      const biomeNameIds = new Map([['', 0]])
      const maskDescriptors = []
      const maskDescriptorIds = new Map()
      const idForBiome = (biome) => {
        const name = biome || ''
        let id = biomeNameIds.get(name)
        if (id !== undefined) return id
        id = biomeNames.length
        biomeNames.push(name)
        biomeNameIds.set(name, id)
        return id
      }
      const idForMask = (descriptor) => {
        let id = maskDescriptorIds.get(descriptor.key)
        if (id !== undefined) return id
        id = maskDescriptors.length + 1
        maskDescriptors.push(descriptor)
        maskDescriptorIds.set(descriptor.key, id)
        return id
      }

      for (let y = 0; y < height; y++) {
        preparation.assertCurrent(this.sequence)
        for (let x = 0; x < width; x++) {
          const index = y * width + x
          const tile = grid[y][x] || {}
          typeIds[index] = TYPE_IDS[tile.type] ?? 255
          biomeIds[index] = idForBiome(tile.biome)
          shorelineMasks[index] = shorelineCornerMask(grid, x, y)
          const sot = sotMask?.[y]?.[x]
          if (sot) {
            sotTypes[index] = SOT_TYPE_IDS[sot.type] ?? SOT_TYPE_IDS.none
            sotOrientations[index] = ORIENTATION_IDS[sot.orientation] ?? -1
          }
          const blend = tile.biomeBlend
          if (blend?.biome && blend.alpha > 0) {
            const descriptor = Array.isArray(blend.cornerWeights) && blend.cornerWeights.length === 4
              ? exactBlendDescriptor(tileSize, density, blend)
              : directionalBlendDescriptor(tileSize, density, x, y, blend)
            blendMaskIds[index] = idForMask(descriptor)
          }
          if (tile.type === 'water' && !tile.airstripStreet && shorelineMasks[index]) {
            for (const [offsetX, offsetY] of SHORE_SOURCE_OFFSETS) {
              const source = grid[y + offsetY]?.[x + offsetX]
              if (source?.airstripStreet || (source?.type !== 'land' && source?.type !== 'rock')) continue
              const biome = source.shorelineBiome || source.biome || 'grass'
              const patternVariant = biome === 'sand' ? terrainHash(x, y, 157) % 6 : false
              shorelineBiomeIds[index] = idForBiome(biome)
              shoreMaskDescriptorIds[index] = idForMask(
                shorelineDescriptor(tileSize, density, shorelineMasks[index], patternVariant)
              )
              break
            }
          }
        }
        this.updateProgress({
          descriptorRows: y + 1,
          completed: assets.length + y + 1
        })
      }
      const cliffDepth = prepareCliffDescriptor(grid, 0, 0, width, height, generation)
      const descriptors = Object.freeze({
        width,
        height,
        typeIds,
        sotTypes,
        sotOrientations,
        shorelineMasks,
        biomeIds,
        shorelineBiomeIds,
        shoreMaskDescriptorIds,
        blendMaskIds,
        biomeNames: Object.freeze(biomeNames),
        maskDescriptors: Object.freeze(maskDescriptors),
        cliffDepth,
        animatedWater: Object.freeze({ baked: false, source: 'live-water-pass' })
      })
      const descriptorBytes = descriptorByteLength(descriptors)
      reservations.push(...reserveAll(this.byteBudget, { terrainResident: descriptorBytes }))

      const preparedMasks = new Map()
      const pixelSize = Math.max(1, Math.round(tileSize * density))
      for (const descriptor of maskDescriptors) {
        preparation.assertCurrent(this.sequence)
        const canvas = rasterizeMask(descriptor, tileSize, density, this.canvasFactory)
        if (canvas) {
          preparedMasks.set(descriptor.key, canvas)
          stagedResources.push(canvas)
        }
      }
      const preparedRasterBytes = checkedProduct(preparedMasks.size, pixelSize, pixelSize, MASK_RASTER_BYTES_PER_PIXEL)
      reservations.push(...reserveAll(this.byteBudget, { terrainResident: preparedRasterBytes }))

      const allResidentRasterEstimate = estimateAllResidentTerrainBytes(width, height, tileSize, density)
      let rasterMode = 'retained-descriptors'
      let rasterPages = null
      let allResidentRasterBytes = 0
      if (rasterPageFactory && allResidentRasterEstimate <= this.maxAllResidentRasterBytes) {
        const stagingToken = this.byteBudget.reserve('terrainStaging', allResidentRasterEstimate, {
          signal: preparation.signal
        })
        try {
          const preparedPages = await rasterPageFactory({
            grid,
            descriptors,
            density,
            tileSize,
            excludeAnimatedWater: true,
            signal: preparation.signal
          })
          preparation.assertCurrent(this.sequence)
          allResidentRasterBytes = preparedPages?.bytes ?? allResidentRasterEstimate
          if (!Number.isSafeInteger(allResidentRasterBytes) || allResidentRasterBytes < 0 ||
            allResidentRasterBytes > allResidentRasterEstimate) {
            throw new RangeError('All-resident raster exceeded its preflight byte reservation')
          }
          reservations.push(this.byteBudget.reserve('terrainResident', allResidentRasterBytes, {
            signal: preparation.signal
          }))
          rasterPages = preparedPages?.resources ?? preparedPages
          rasterMode = 'all-resident-raster'
        } finally {
          stagingToken.release()
        }
      }
      reservations.push(...reserveAll(this.byteBudget, {
        transfer: transferBytes,
        gpuStaging: gpuStagingBytes
      }))

      const byteUsage = Object.freeze({
        decodedSourceBytes,
        descriptorBytes,
        preparedRasterBytes: preparedRasterBytes + allResidentRasterBytes,
        transferBytes,
        gpuStagingBytes,
        allResidentRasterEstimate,
        terrainResidentBytes: descriptorBytes + preparedRasterBytes + allResidentRasterBytes,
        terrainStagingPeakBytes: rasterMode === 'all-resident-raster' ? allResidentRasterEstimate : 0
      })
      const assetResources = imageEntriesToResources(decodedEntries)
      const resources = {
        ...assetResources,
        descriptors,
        preparedMasks,
        rasterPages,
        rasterMode,
        reservations
      }
      const prepared = new PreparedMap({
        generation,
        assetGeneration,
        density,
        byteUsage,
        resources,
        disposeResource: (owned) => {
          if (!owned) return
          for (const canvas of owned.preparedMasks?.values?.() || []) {
            if ('width' in canvas) canvas.width = 0
            if ('height' in canvas) canvas.height = 0
            canvas.close?.()
          }
          owned.preparedMasks?.clear?.()
          if (Array.isArray(owned.rasterPages)) {
            for (const page of owned.rasterPages) page?.close?.()
          } else {
            owned.rasterPages?.close?.()
          }
          releaseTokens(owned.reservations)
        }
      })
      failedMap = prepared
      preparation.assertCurrent(this.sequence)
      prepared.publish()
      const previous = this.current
      this.current = prepared
      this.active = null
      this.state = 'ready'
      this.updateProgress({ state: 'ready', completed: this.progress.total })
      try {
        this.onPublish?.(prepared)
      } catch (error) {
        this.lastError = error
      }
      previous?.dispose()
      return prepared
    } catch (error) {
      if (failedMap?.state === 'preparing') failedMap.fail(error)
      failedMap?.dispose()
      releaseTokens(reservations)
      for (const resource of stagedResources) resource?.close?.()
      this.lastError = error
      this.active = null
      const aborted = preparation.signal.aborted || error?.name === 'AbortError'
      this.state = aborted ? 'cancelled' : 'failed'
      this.updateProgress({ state: this.state })
      if (aborted && error?.name !== 'AbortError') throw abortError(preparation.signal.reason)
      throw error
    } finally {
      signal?.removeEventListener?.('abort', abortFromCaller)
    }
  }

  dispose() {
    if (this.state === 'disposed') return
    this.cancel('Terrain preparation disposed')
    this.active = null
    this.current?.dispose()
    this.current = null
    this.state = 'disposed'
    this.updateProgress({ state: 'disposed' })
  }
}
