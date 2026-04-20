// rendering/textureManager.js
import { TILE_SIZE, TILE_IMAGES, GRASS_DECORATIVE_RATIO, GRASS_IMPASSABLE_RATIO, TILE_SPRITE_SHEET, TILE_SPRITE_MAP } from '../config.js'
import { buildingImageMap } from '../buildingImageMap.js'
import { getDevicePixelRatio } from './renderingUtils.js'
import { discoverGrassTiles } from '../utils/grassTileDiscovery.js'
import { getImageTextureWithBlendMode, normalizeSpriteSheetBlendMode } from './spriteSheetAnimation.js'

const DEFAULT_COMBAT_DECAL_SHEET_PATH = 'images/map/sprite_sheets/debris_craters_tracks.webp'
const DEFAULT_COMBAT_DECAL_METADATA_PATH = 'images/map/sprite_sheets/debris_craters_tracks.json'
const DEFAULT_CRYSTAL_SHEET_PATH = 'images/map/sprite_sheets/crystals_q90_1024x1024.webp'
const DEFAULT_CRYSTAL_METADATA_PATH = 'images/map/sprite_sheets/crystals_q90_1024x1024.json'

// Map unit types to their image paths
const unitImageMap = {
  tank: 'images/tank.webp',
  tank_v1: 'images/tank.webp',
  'tank-v2': 'images/tank_v2.webp',
  tank_v2: 'images/tank_v2.webp',
  'tank-v3': 'images/tank_v3.webp',
  tank_v3: 'images/tank_v3.webp',
  rocketTank: 'images/map/units/rocket_tank.webp',
  harvester: 'images/harvester.webp',
  artilleryTank: 'images/artillery_tank.webp',
  howitzer: 'images/map/units/howitzer_map.webp'
}

export class TextureManager {
  constructor() {
    this.imageCache = {}
    this.loadingImages = {}
    this.tileTextureCache = {}
    this.tileVariationMap = {}
    this.spriteImage = null
    this.spriteMap = {}
    this.allTexturesLoaded = false
    this.loadingStarted = false
    this.waterFrames = []
    this.waterFrameIndex = 0
    this.lastWaterFrameTime = 0
    this.integratedSpriteSheetMode = false
    this.integratedSpriteSheetPath = null
    this.integratedSpriteSheetImage = null
    this.integratedSpriteSheetMetadata = null
    this.integratedSpriteSheetImagesByPath = {}
    this.integratedSpriteSheets = []
    this.integratedTagBuckets = {}
    this.integratedBiomeTag = 'grass'
    this.integratedBlendMode = 'black'
    this.integratedBlackKey = null
    this.defaultCombatDecalSheetImage = null
    this.defaultCombatDecalSheetMetadata = null
    this.defaultCombatDecalTagBuckets = {}
    this.defaultCrystalSheetImage = null
    this.defaultCrystalSheetMetadata = null
    this.defaultCrystalTagBuckets = {}
    this.integratedGroupedTagCatalog = {}
    this.defaultCombatDecalGroupedTagCatalog = {}
    this.integratedConfigVersion = 0
    this.integratedRenderSignature = 'off'
  }

  getTagBucketCandidates(buckets, requiredTags, excludedTags = []) {
    if (!Array.isArray(requiredTags) || !requiredTags.length) return []

    let seedBucket = null

    requiredTags.forEach((tag) => {
      const bucket = buckets?.[tag]
      if (!Array.isArray(bucket) || !bucket.length) {
        seedBucket = []
        return
      }
      if (!seedBucket || bucket.length < seedBucket.length) {
        seedBucket = bucket
      }
    })

    if (!Array.isArray(seedBucket) || !seedBucket.length) {
      return []
    }

    return seedBucket.filter((tile) => {
      if (!Array.isArray(tile?.tags) || !tile.rect) return false
      const hasRequired = requiredTags.every(tag => tile.tags.includes(tag))
      if (!hasRequired) return false
      return excludedTags.every(tag => !tile.tags.includes(tag))
    })
  }

  async loadIntegratedSpriteSheetImage(sheetPath) {
    if (!sheetPath) return null
    if (this.integratedSpriteSheetImagesByPath[sheetPath]) {
      return this.integratedSpriteSheetImagesByPath[sheetPath]
    }

    const image = await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      const isDirectPath = sheetPath.startsWith('/')
        || sheetPath.startsWith('blob:')
        || sheetPath.startsWith('data:')
        || /^https?:\/\//i.test(sheetPath)
      img.src = isDirectPath ? sheetPath : `/${sheetPath}`
    })

    if (image) {
      this.integratedSpriteSheetImagesByPath[sheetPath] = image
      this.integratedSpriteSheetPath = sheetPath
      this.integratedSpriteSheetImage = image
    }

    return image
  }

  buildIntegratedTagBuckets(sheetEntries) {
    const buckets = {}
    if (!Array.isArray(sheetEntries)) return buckets

    sheetEntries.forEach((entry) => {
      if (!entry?.metadata?.tiles || !entry?.image) return
      Object.values(entry.metadata.tiles).forEach((tile) => {
        if (!tile?.rect || !Array.isArray(tile.tags) || !tile.tags.length) return
        const grouped = TextureManager.getGroupTagId(tile.tags)
        if (grouped) return
        const tileRef = {
          ...tile,
          image: getImageTextureWithBlendMode(entry.image, entry.blendMode, entry.blackKey),
          blendMode: entry.blendMode,
          blackKey: entry.blackKey,
          sheetPath: entry.sheetPath
        }
        tile.tags.forEach((tag) => {
          if (!buckets[tag]) {
            buckets[tag] = []
          }
          buckets[tag].push(tileRef)
        })
      })
    })

    return buckets
  }

  static getGroupTagId(tags) {
    if (!Array.isArray(tags)) return null
    const groupLabel = tags.find(tag => /^group_\d+$/.test(tag))
    if (!groupLabel) return null
    return groupLabel
  }

  buildGroupedTagCatalog(sheetEntries) {
    const catalog = {}
    if (!Array.isArray(sheetEntries)) return catalog

    const groupsBySheet = new Map()
    sheetEntries.forEach((entry) => {
      const metadataTiles = entry?.metadata?.tiles
      if (!metadataTiles || !entry?.image) return
      Object.values(metadataTiles).forEach((tile) => {
        if (!tile?.rect || !Array.isArray(tile.tags)) return
        const groupLabel = TextureManager.getGroupTagId(tile.tags)
        if (!groupLabel) return
        const sheetGroups = groupsBySheet.get(entry.sheetPath) || {}
        if (!sheetGroups[groupLabel]) {
          sheetGroups[groupLabel] = []
        }
        sheetGroups[groupLabel].push({
          ...tile,
          image: getImageTextureWithBlendMode(entry.image, entry.blendMode, entry.blackKey),
          blendMode: entry.blendMode,
          blackKey: entry.blackKey,
          sheetPath: entry.sheetPath
        })
        groupsBySheet.set(entry.sheetPath, sheetGroups)
      })
    })

    groupsBySheet.forEach((sheetGroups) => {
      Object.entries(sheetGroups).forEach(([groupLabel, tiles]) => {
        if (!Array.isArray(tiles) || !tiles.length) return
        const cols = tiles.map(tile => tile.col)
        const rows = tiles.map(tile => tile.row)
        const minCol = Math.min(...cols)
        const maxCol = Math.max(...cols)
        const minRow = Math.min(...rows)
        const maxRow = Math.max(...rows)
        const width = (maxCol - minCol) + 1
        const height = (maxRow - minRow) + 1
        if (tiles.length !== width * height) return

        const lookup = new Set(tiles.map(tile => `${tile.col},${tile.row}`))
        for (let row = minRow; row <= maxRow; row++) {
          for (let col = minCol; col <= maxCol; col++) {
            if (!lookup.has(`${col},${row}`)) return
          }
        }

        const offsetTiles = {}
        tiles.forEach((tile) => {
          const offsetX = tile.col - minCol
          const offsetY = tile.row - minRow
          offsetTiles[`${offsetX},${offsetY}`] = tile
        })

        const tagSet = new Set()
        tiles.forEach((tile) => {
          tile.tags.forEach((tag) => {
            if (tag === 'group' || /^group_\d+$/.test(tag)) return
            tagSet.add(tag)
          })
        })
        tagSet.forEach((tag) => {
          if (!catalog[tag]) catalog[tag] = []
          catalog[tag].push({
            groupLabel,
            width,
            height,
            area: width * height,
            tilesByOffset: offsetTiles
          })
        })
      })
    })

    Object.values(catalog).forEach((groups) => {
      groups.sort((a, b) => b.area - a.area || b.width - a.width || b.height - a.height)
    })
    return catalog
  }

  hasTaggedIntegratedTiles(metadata) {
    if (!metadata?.tiles || typeof metadata.tiles !== 'object') return false
    return Object.values(metadata.tiles).some(tile => Array.isArray(tile?.tags) && tile.tags.length > 0 && tile.rect)
  }

  async preloadDefaultCombatDecalSheet() {
    try {
      const response = await fetch(DEFAULT_COMBAT_DECAL_METADATA_PATH, { cache: 'no-store' })
      if (!response.ok) {
        this.defaultCombatDecalSheetMetadata = null
        this.defaultCombatDecalTagBuckets = {}
        return
      }

      const metadata = await response.json()
      if (!this.hasTaggedIntegratedTiles(metadata)) {
        this.defaultCombatDecalSheetMetadata = null
        this.defaultCombatDecalTagBuckets = {}
        return
      }

      const image = await this.loadIntegratedSpriteSheetImage(DEFAULT_COMBAT_DECAL_SHEET_PATH)
      if (!image) {
        this.defaultCombatDecalSheetMetadata = null
        this.defaultCombatDecalTagBuckets = {}
        return
      }

      this.defaultCombatDecalSheetImage = image
      this.defaultCombatDecalSheetMetadata = {
        ...metadata,
        sheetPath: DEFAULT_COMBAT_DECAL_SHEET_PATH
      }
      this.defaultCombatDecalTagBuckets = this.buildIntegratedTagBuckets([{
        sheetPath: DEFAULT_COMBAT_DECAL_SHEET_PATH,
        metadata: this.defaultCombatDecalSheetMetadata,
        image,
        blendMode: normalizeSpriteSheetBlendMode(metadata?.blendMode),
        blackKey: metadata?.blackKey || null
      }])
      this.defaultCombatDecalGroupedTagCatalog = this.buildGroupedTagCatalog([{
        sheetPath: DEFAULT_COMBAT_DECAL_SHEET_PATH,
        metadata: this.defaultCombatDecalSheetMetadata,
        image,
        blendMode: normalizeSpriteSheetBlendMode(metadata?.blendMode),
        blackKey: metadata?.blackKey || null
      }])
    } catch (err) {
      this.defaultCombatDecalSheetMetadata = null
      this.defaultCombatDecalTagBuckets = {}
      this.defaultCombatDecalGroupedTagCatalog = {}
      window.logger.warn('Failed to preload default combat decal sheet:', err)
    }
  }

  async preloadDefaultCrystalSheet() {
    try {
      const response = await fetch(DEFAULT_CRYSTAL_METADATA_PATH, { cache: 'no-store' })
      if (!response.ok) {
        this.defaultCrystalSheetMetadata = null
        this.defaultCrystalTagBuckets = {}
        return
      }

      const metadata = await response.json()
      if (!this.hasTaggedIntegratedTiles(metadata)) {
        this.defaultCrystalSheetMetadata = null
        this.defaultCrystalTagBuckets = {}
        return
      }

      const image = await this.loadIntegratedSpriteSheetImage(DEFAULT_CRYSTAL_SHEET_PATH)
      if (!image) {
        this.defaultCrystalSheetMetadata = null
        this.defaultCrystalTagBuckets = {}
        return
      }

      this.defaultCrystalSheetImage = image
      this.defaultCrystalSheetMetadata = {
        ...metadata,
        sheetPath: DEFAULT_CRYSTAL_SHEET_PATH
      }
      this.defaultCrystalTagBuckets = this.buildIntegratedTagBuckets([{
        sheetPath: DEFAULT_CRYSTAL_SHEET_PATH,
        metadata: this.defaultCrystalSheetMetadata,
        image,
        blendMode: normalizeSpriteSheetBlendMode(metadata?.blendMode),
        blackKey: metadata?.blackKey || null
      }])
    } catch (err) {
      this.defaultCrystalSheetMetadata = null
      this.defaultCrystalTagBuckets = {}
      window.logger.warn('Failed to preload default crystal sheet:', err)
    }
  }

  async setIntegratedSpriteSheetConfig(config = {}) {
    const enabled = Boolean(config?.enabled)
    if (!enabled) {
      this.integratedSpriteSheetMode = false
      this.integratedSpriteSheetMetadata = null
      this.integratedSpriteSheets = []
      this.integratedTagBuckets = {}
      this.integratedBlendMode = 'black'
      this.integratedBlackKey = null
      this.integratedGroupedTagCatalog = {}
      this.integratedRenderSignature = 'off'
      this.integratedConfigVersion++
      return
    }

    const sheetEntries = Array.isArray(config?.sheets) && config.sheets.length
      ? config.sheets
      : [{
        sheetPath: config?.sheetPath,
        metadata: config?.metadata
      }]

    const normalizedEntries = []
    for (const entry of sheetEntries) {
      const sheetPath = entry?.sheetPath
      const metadata = entry?.metadata
      if (!sheetPath || !metadata) continue
      if (!this.hasTaggedIntegratedTiles(metadata)) continue
      const image = await this.loadIntegratedSpriteSheetImage(sheetPath)
      if (!image) continue
      normalizedEntries.push({
        sheetPath,
        metadata,
        image,
        blendMode: normalizeSpriteSheetBlendMode(metadata?.blendMode),
        blackKey: metadata?.blackKey || null
      })
    }

    if (!normalizedEntries.length) {
      this.integratedSpriteSheetMode = false
      this.integratedSpriteSheetMetadata = null
      this.integratedSpriteSheets = []
      this.integratedTagBuckets = {}
      this.integratedBlendMode = 'black'
      this.integratedBlackKey = null
      this.integratedGroupedTagCatalog = {}
      this.integratedRenderSignature = 'off'
      this.integratedConfigVersion++
      return
    }

    this.integratedSpriteSheetMode = true
    this.integratedSpriteSheets = normalizedEntries
    this.integratedSpriteSheetPath = normalizedEntries[0].sheetPath
    this.integratedSpriteSheetImage = normalizedEntries[0].image
    this.integratedSpriteSheetMetadata = normalizedEntries[0].metadata
    this.integratedTagBuckets = this.buildIntegratedTagBuckets(normalizedEntries)
    this.integratedGroupedTagCatalog = this.buildGroupedTagCatalog(normalizedEntries)
    this.integratedBiomeTag = ['soil', 'sand', 'grass', 'snow'].includes(config?.biomeTag) ? config.biomeTag : 'grass'
    this.integratedBlendMode = normalizeSpriteSheetBlendMode(normalizedEntries[0].metadata?.blendMode)
    this.integratedBlackKey = normalizedEntries[0].blackKey
    const signatureSheets = normalizedEntries
      .map(entry => `${entry.sheetPath}|${entry.metadata?.tileSize}|${entry.metadata?.borderWidth}|${Object.keys(entry.metadata?.tiles || {}).length}|${entry.blendMode}|${entry.blackKey?.cutoffBrightness ?? 'default'}|${entry.blackKey?.softenBrightness ?? 'default'}`)
      .join(';')
    this.integratedRenderSignature = `${signatureSheets}|${this.integratedBiomeTag}`
    this.integratedConfigVersion++
  }

  static coordHash(x, y) {
    let hash = ((x * 73856093) ^ (y * 19349663) ^ ((x + y) * 83492791)) >>> 0
    hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
    hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
    hash = (hash >>> 16) ^ hash
    return Math.abs(hash)
  }

  getLandClassificationTag(x, y) {
    const landIndex = this.getTileVariation('land', x, y)
    const info = this.grassTileMetadata
    if (!info || !Number.isFinite(landIndex)) {
      return 'passable'
    }

    const { passableCount, decorativeCount } = info
    if (landIndex < passableCount) return 'passable'
    if (landIndex < passableCount + decorativeCount) return 'decorative'
    return 'impassable'
  }

  selectIntegratedTileByTags(requiredTags, x, y, excludedTags = []) {
    if (!Array.isArray(requiredTags) || !requiredTags.length) return null

    const buckets = this.integratedTagBuckets || {}
    let seedBucket = null

    requiredTags.forEach((tag) => {
      const bucket = buckets[tag]
      if (!Array.isArray(bucket) || !bucket.length) {
        seedBucket = []
        return
      }
      if (!seedBucket || bucket.length < seedBucket.length) {
        seedBucket = bucket
      }
    })

    if (!Array.isArray(seedBucket) || !seedBucket.length) {
      return null
    }

    const filtered = seedBucket.filter((tile) => {
      if (!Array.isArray(tile?.tags) || !tile.rect) return false
      const hasRequired = requiredTags.every(tag => tile.tags.includes(tag))
      if (!hasRequired) return false
      return excludedTags.every(tag => !tile.tags.includes(tag))
    })

    if (!filtered.length) {
      return null
    }

    return filtered[TextureManager.coordHash(x, y) % filtered.length]
  }

  getIntegratedTileCandidatesByTags(requiredTags, excludedTags = []) {
    return this.getTagBucketCandidates(this.integratedTagBuckets || {}, requiredTags, excludedTags)
  }

  getDecalTileCandidatesByTags(requiredTags, excludedTags = []) {
    const integratedCandidates = this.getIntegratedTileCandidatesByTags(requiredTags, excludedTags)
    if (integratedCandidates.length > 0) {
      return integratedCandidates
    }

    return this.getTagBucketCandidates(this.defaultCombatDecalTagBuckets || {}, requiredTags, excludedTags)
  }

  selectDefaultCrystalTileByTags(requiredTags, x, y, excludedTags = []) {
    const candidates = this.getTagBucketCandidates(this.defaultCrystalTagBuckets || {}, requiredTags, excludedTags)
    return this.selectIntegratedTileFromCandidates(candidates, x, y)
  }

  selectCrystalTileByDensity(type, tileX, tileY, density = 1) {
    const normalizedDensity = Math.max(1, Math.min(5, Number.isFinite(density) ? Math.floor(density) : 1))
    if (type === 'seedCrystal') {
      return this.selectIntegratedTileByTags(
        ['red', 'density_' + normalizedDensity],
        tileX,
        tileY
      ) || this.selectIntegratedTileByTags(
        ['ore', 'red', 'density_' + normalizedDensity],
        tileX,
        tileY
      ) || this.selectIntegratedTileByTags(
        ['ore', 'density_' + normalizedDensity],
        tileX,
        tileY
      ) || this.selectDefaultCrystalTileByTags(
        ['red', 'density_' + normalizedDensity],
        tileX,
        tileY
      ) || this.selectDefaultCrystalTileByTags(
        ['ore', 'red', 'density_' + normalizedDensity],
        tileX,
        tileY
      ) || this.selectDefaultCrystalTileByTags(
        ['ore', 'density_' + normalizedDensity],
        tileX,
        tileY
      )
    }

    return this.selectIntegratedTileByTags(
      ['ore', 'density_' + normalizedDensity],
      tileX,
      tileY
    ) || this.selectDefaultCrystalTileByTags(
      ['ore', 'density_' + normalizedDensity],
      tileX,
      tileY
    )
  }

  selectIntegratedTileFromCandidates(candidates, x, y) {
    if (!Array.isArray(candidates) || !candidates.length) return null
    return candidates[TextureManager.coordHash(x, y) % candidates.length]
  }

  getGroupedTagCandidates(tag, { includeDefaultDecals = false } = {}) {
    const integrated = Array.isArray(this.integratedGroupedTagCatalog?.[tag]) ? this.integratedGroupedTagCatalog[tag] : []
    if (!includeDefaultDecals) {
      return integrated
    }
    const fallback = Array.isArray(this.defaultCombatDecalGroupedTagCatalog?.[tag]) ? this.defaultCombatDecalGroupedTagCatalog[tag] : []
    return integrated.length ? integrated : fallback
  }

  selectGroupedTileVariant(tag, options = {}) {
    const width = Math.max(1, Math.floor(options.width || 1))
    const height = Math.max(1, Math.floor(options.height || 1))
    const offsetX = Math.max(0, Math.floor(options.offsetX || 0))
    const offsetY = Math.max(0, Math.floor(options.offsetY || 0))
    const includeDefaultDecals = Boolean(options.includeDefaultDecals)
    const groups = this.getGroupedTagCandidates(tag, { includeDefaultDecals })
      .filter(group => group.width === width && group.height === height)
    if (!groups.length) return null
    const seed = Number.isFinite(options.seed) ? options.seed : 0
    const selectedGroup = groups[Math.abs(seed) % groups.length]
    return selectedGroup.tilesByOffset[`${offsetX},${offsetY}`] || null
  }

  selectGroupedTileForMapTile(tag, x, y, mapGrid, matchesCell) {
    const groups = this.getGroupedTagCandidates(tag)
    if (!Array.isArray(groups) || !groups.length || !Array.isArray(mapGrid)) return null
    const mapHeight = mapGrid.length
    const mapWidth = mapGrid[0]?.length || 0
    if (!mapWidth || !mapHeight) return null

    for (const group of groups) {
      for (let offsetY = 0; offsetY < group.height; offsetY++) {
        for (let offsetX = 0; offsetX < group.width; offsetX++) {
          const anchorX = x - offsetX
          const anchorY = y - offsetY
          if (anchorX < 0 || anchorY < 0) continue
          if ((anchorX + group.width) > mapWidth || (anchorY + group.height) > mapHeight) continue
          let fits = true
          for (let gy = 0; gy < group.height && fits; gy++) {
            for (let gx = 0; gx < group.width; gx++) {
              if (!matchesCell(anchorX + gx, anchorY + gy)) {
                fits = false
                break
              }
            }
          }
          if (!fits) continue
          const selected = group.tilesByOffset[`${offsetX},${offsetY}`]
          if (selected?.rect) return selected
        }
      }
    }
    return null
  }

  getIntegratedTileForMapTile(type, x, y, options = {}) {
    if (!this.integratedSpriteSheetMode || !this.integratedSpriteSheetImage || !this.integratedSpriteSheetMetadata) {
      return null
    }

    let selected = null
    const mapGrid = options?.mapGrid

    if (type === 'land') {
      const classification = this.getLandClassificationTag(x, y)
      const biomeDecorativeCandidates = this.getIntegratedTileCandidatesByTags([this.integratedBiomeTag, 'decorative'])
      if (classification === 'decorative') {
        if (mapGrid) {
          selected = this.selectGroupedTileForMapTile('decorative', x, y, mapGrid, (cellX, cellY) => {
            const tile = mapGrid[cellY]?.[cellX]
            return tile?.type === 'land' && this.getLandClassificationTag(cellX, cellY) === 'decorative'
          })
        }
        if (biomeDecorativeCandidates.length) {
          selected = selected || this.selectIntegratedTileFromCandidates(biomeDecorativeCandidates, x, y)
        }
      } else if (classification === 'impassable') {
        selected = this.selectIntegratedTileByTags([this.integratedBiomeTag, 'impassable'], x, y)
      } else {
        selected = this.selectIntegratedTileByTags([this.integratedBiomeTag, 'passable'], x, y, ['decorative', 'impassable'])
          || this.selectIntegratedTileByTags([this.integratedBiomeTag], x, y, ['decorative', 'impassable'])
      }
    } else if (type === 'street') {
      selected = this.selectIntegratedTileByTags(['street'], x, y)
    } else if (type === 'rock') {
      if (mapGrid) {
        selected = this.selectGroupedTileForMapTile('rocks', x, y, mapGrid, (cellX, cellY) => mapGrid[cellY]?.[cellX]?.type === 'rock')
          || this.selectGroupedTileForMapTile('rock', x, y, mapGrid, (cellX, cellY) => mapGrid[cellY]?.[cellX]?.type === 'rock')
      }
      selected = selected || this.selectIntegratedTileByTags(['rocks'], x, y)
        || this.selectIntegratedTileByTags(['rock'], x, y)
    } else if (type === 'water') {
      selected = this.selectIntegratedTileByTags(['water'], x, y)
    } else {
      selected = this.selectIntegratedTileByTags([type], x, y)
        || this.selectIntegratedTileByTags(['passable'], x, y)
    }

    if (!selected?.rect) return null

    return {
      image: selected.image || getImageTextureWithBlendMode(this.integratedSpriteSheetImage, this.integratedBlendMode, this.integratedBlackKey),
      rect: selected.rect,
      tags: selected.tags || [],
      sheetPath: selected.sheetPath || null
    }
  }

  // Helper function to load images once
  getOrLoadImage(baseName, extensions = ['webp', 'jpg', 'png'], callback) {
    // Check if image is already in cache
    if (this.imageCache[baseName]) {
      callback(this.imageCache[baseName])
      return
    }

    // Check if this image is already being loaded
    if (this.loadingImages[baseName]) {
      // Add this callback to the queue
      this.loadingImages[baseName].push(callback)
      return
    }

    // Start loading this image and create callback queue
    this.loadingImages[baseName] = [callback]

    // Try loading with different extensions
    const tryLoadImage = (baseName, extensions, index = 0) => {
      if (index >= extensions.length) {
        // Nothing worked - notify all callbacks with failure
        while (this.loadingImages[baseName].length > 0) {
          const cb = this.loadingImages[baseName].shift()
          cb(null)
        }
        delete this.loadingImages[baseName]
        window.logger.warn(`Failed to load image: ${baseName}. Tried extensions: ${extensions.join(', ')}`)
        // Show which image maps contain this asset for debugging
        if (buildingImageMap && Object.values(buildingImageMap).includes(baseName)) {
          console.info('Note: This image is referenced in buildingImageMap')
        }
        if (unitImageMap && Object.values(unitImageMap).includes(baseName)) {
          console.info('Note: This image is referenced in unitImageMap')
        }
        return
      }

      const img = new Image()
      img.onload = () => {
        // Cache the loaded image
        this.imageCache[baseName] = img
        console.debug(`✅ Successfully loaded: ${baseName}.${extensions[index]}`)

        // Notify all waiting callbacks
        while (this.loadingImages[baseName].length > 0) {
          const cb = this.loadingImages[baseName].shift()
          cb(img)
        }
        delete this.loadingImages[baseName]
      }

      img.onerror = () => {
        // Try next extension
        tryLoadImage(baseName, extensions, index + 1)
      }

      // The public directory is served at the root
      img.src = `${baseName}.${extensions[index]}`
    }

    tryLoadImage(baseName, extensions, 0)
  }


  // Preload all tile textures at startup
  async preloadAllTextures(callback) {
    if (this.loadingStarted) return
    this.loadingStarted = true

    const mappingRes = await fetch(TILE_SPRITE_MAP)
    const spriteMap = await mappingRes.json()
    this.spriteMap = spriteMap

    const spriteImg = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = TILE_SPRITE_SHEET
    })
    this.spriteImage = spriteImg

    // Load water animation frames
    const waterImg = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = 'images/map/water_spritesheet.webp'
    })
    this.waterFrames = []
    for (let i = 0; i < 16; i++) {
      const canvas = document.createElement('canvas')
      canvas.width = TILE_SIZE
      canvas.height = TILE_SIZE
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      const sx = (i % 8) * 64
      const sy = Math.floor(i / 8) * 64
      ctx.drawImage(waterImg, sx, sy, 64, 64, 0, 0, TILE_SIZE, TILE_SIZE)
      this.waterFrames.push(canvas)
    }

    // Discover grass tiles configuration
    let grassTileData = null
    const landInfo = TILE_IMAGES.land
    if (landInfo && landInfo.useGrassTileDiscovery) {
      try {
        grassTileData = await discoverGrassTiles()
      } catch (err) {
        console.error('Failed to load grass tiles configuration:', err)
      }
    }

    for (const [tileType] of Object.entries(TILE_IMAGES)) {
      this.tileTextureCache[tileType] = []
    }

    if (grassTileData) {
      this.grassTileMetadata = {
        passableCount: grassTileData.passablePaths.length,
        decorativeCount: grassTileData.decorativePaths.length,
        impassableCount: grassTileData.impassablePaths.length
      }
    }

    const addFromPath = (p, type) => {
      const key = p.replace(/^images\/map\//, '')
      const info = this.spriteMap[key]
      if (info) {
        this.tileTextureCache[type].push({ key, ...info })
      }
    }

    for (const [tileType, tileInfo] of Object.entries(TILE_IMAGES)) {
      if (tileType === 'land' && grassTileData) {
        grassTileData.passablePaths.forEach(p => addFromPath(p, tileType))
        grassTileData.decorativePaths.forEach(p => addFromPath(p, tileType))
        grassTileData.impassablePaths.forEach(p => addFromPath(p, tileType))
      }
      if (tileInfo.paths) tileInfo.paths.forEach(p => addFromPath(p, tileType))
      if (tileInfo.passablePaths) tileInfo.passablePaths.forEach(p => addFromPath(p, tileType))
      if (tileInfo.impassablePaths) tileInfo.impassablePaths.forEach(p => addFromPath(p, tileType))
    }

    await this.preloadDefaultCombatDecalSheet()
    await this.preloadDefaultCrystalSheet()

    this.allTexturesLoaded = true
    if (callback) callback()
  }

  // Helper method to load a single texture
  loadSingleTexture(imagePath, tileType, onComplete) {
    // Determine appropriate extensions based on tile type and path
    let extensions = ['webp', 'jpg', 'png'] // Default order

    // For ore and seed crystal files, try webp first since they're primarily webp
    if (imagePath.includes('ore') || tileType === 'ore' || tileType === 'seedCrystal') {
      extensions = ['webp', 'jpg', 'png']
    }
    // For grass tiles, try png first since they're png files
    else if (imagePath.includes('grass_tiles') || tileType === 'land') {
      extensions = ['png', 'jpg', 'webp']
    }

    this.getOrLoadImage(imagePath, extensions, (img) => {
      if (img) {
        const pixelRatio = getDevicePixelRatio()

        // Create a canvas for the texture at the correct size, accounting for pixel ratio
        const baseCanvas = document.createElement('canvas')
        baseCanvas.width = TILE_SIZE * pixelRatio
        baseCanvas.height = TILE_SIZE * pixelRatio

        // Set display size (CSS) to maintain aspect
        baseCanvas.style.width = `${TILE_SIZE}px`
        baseCanvas.style.height = `${TILE_SIZE}px`

        const baseCtx = baseCanvas.getContext('2d')

        // Apply high-quality image rendering
        baseCtx.imageSmoothingEnabled = true
        baseCtx.imageSmoothingQuality = 'high'

        // Apply pixel ratio scaling
        baseCtx.scale(pixelRatio, pixelRatio)

        // Use a two-step scaling process for better quality
        // First draw to an intermediate canvas at 2x size for better downscaling
        const tempCanvas = document.createElement('canvas')
        const tempSize = TILE_SIZE * 2
        tempCanvas.width = tempSize
        tempCanvas.height = tempSize

        const tempCtx = tempCanvas.getContext('2d')
        tempCtx.imageSmoothingEnabled = true
        tempCtx.imageSmoothingQuality = 'high'

        // Draw original image to the intermediate canvas, maintaining aspect ratio
        const aspectRatio = img.width / img.height
        let drawWidth, drawHeight

        if (aspectRatio > 1) {
          // Image is wider than tall
          drawWidth = tempSize
          drawHeight = tempSize / aspectRatio
        } else {
          // Image is taller than wide
          drawWidth = tempSize * aspectRatio
          drawHeight = tempSize
        }

        // Center the image in the canvas
        tempCtx.drawImage(img, (tempSize - drawWidth) / 2, (tempSize - drawHeight) / 2, drawWidth, drawHeight)

        // Draw from the intermediate canvas to the final canvas
        baseCtx.drawImage(tempCanvas, 0, 0, TILE_SIZE, TILE_SIZE)

        // Add the single texture to the cache (no variations)
        this.tileTextureCache[tileType].push(baseCanvas)
      }

      onComplete()
    })
  }

  // Get a consistent tile variation based on position
  getTileVariation(tileType, x, y) {
    // Create unique key for this tile position and type
    const key = `${tileType}_${x}_${y}`

    // If we already determined a variation for this tile, use it
    if (this.tileVariationMap[key] !== undefined) {
      return this.tileVariationMap[key]
    }

    // If no variations available, return -1 to use color fallback
    if (!this.tileTextureCache[tileType] || this.tileTextureCache[tileType].length === 0) {
      return -1
    }

    // Special handling for land tiles with dynamically discovered grass tiles
    if (tileType === 'land' && this.grassTileMetadata) {
      const { passableCount, decorativeCount, impassableCount } = this.grassTileMetadata

      // Better hash function - more random but still reliable
      // Mix x and y coordinates in a non-linear way to avoid patterns
      let hash = ((x * 73856093) ^ (y * 19349663) ^ ((x + y) * 83492791)) >>> 0
      hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
      hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
      hash = (hash >>> 16) ^ hash
      hash = Math.abs(hash)

      // Simple ratio-based selection
      // Check for impassable first (rarer)
      if (hash % GRASS_IMPASSABLE_RATIO === 0) {
        // Select from impassable tiles (they start after passable + decorative)
        const impassableStartIndex = passableCount + decorativeCount
        const selectedIndex = impassableStartIndex + (hash % impassableCount)

        // Bounds check
        if (selectedIndex >= this.tileTextureCache[tileType].length) {
          window.logger.warn(`Impassable index out of bounds: ${selectedIndex} >= ${this.tileTextureCache[tileType].length}`)
          return 0 // Default to first tile
        }

        this.tileVariationMap[key] = selectedIndex
        return selectedIndex
      }

      // Check for decorative second
      if (hash % GRASS_DECORATIVE_RATIO === 0) {
        // Select from decorative tiles (they start after passable)
        const decorativeStartIndex = passableCount
        const selectedIndex = decorativeStartIndex + (hash % decorativeCount)

        // Bounds check
        if (selectedIndex >= this.tileTextureCache[tileType].length) {
          window.logger.warn(`Decorative index out of bounds: ${selectedIndex} >= ${this.tileTextureCache[tileType].length}`)
          return 0 // Default to first tile
        }

        this.tileVariationMap[key] = selectedIndex
        return selectedIndex
      }

      // Default to passable tiles
      const selectedIndex = hash % passableCount

      // Bounds check
      if (selectedIndex >= this.tileTextureCache[tileType].length) {
        window.logger.warn(`Passable index out of bounds: ${selectedIndex} >= ${this.tileTextureCache[tileType].length}`)
        return 0 // Default to first tile
      }

      this.tileVariationMap[key] = selectedIndex

      return selectedIndex
    }

    // Legacy handling for hardcoded grass tiles
    if (tileType === 'land') {
      const tileInfo = TILE_IMAGES[tileType]
      if (tileInfo && tileInfo.passablePaths && tileInfo.impassablePaths) {
        // Calculate how many textures we have for each type (no multiplier needed)
        const legacyCount = tileInfo.paths ? tileInfo.paths.length : 0
        const passableCount = tileInfo.passablePaths.length
        const impassableCount = tileInfo.impassablePaths.length

        // Better hash function for good randomness without patterns
        let hash = ((x * 73856093) ^ (y * 19349663) ^ ((x + y) * 83492791)) >>> 0
        hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
        hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
        hash = (hash >>> 16) ^ hash
        hash = Math.abs(hash)

        // Create weighted selection: prefer new grass tiles over legacy
        // If we have new tiles, use 50:1 ratio for passable:impassable
        // Total weight = 50 (passable) + 1 (impassable) = 51
        const weightedChoice = hash % 51

        let selectedIndex
        if (weightedChoice < 50) {
          // Select from passable tiles (0-49 out of 51)
          selectedIndex = legacyCount + (hash % passableCount)
        } else {
          // Select from impassable tiles (50 out of 51)
          selectedIndex = legacyCount + passableCount + (hash % impassableCount)
        }

        // Ensure we don't exceed the available textures
        selectedIndex = selectedIndex % this.tileTextureCache[tileType].length

        // Store the variation for this position
        this.tileVariationMap[key] = selectedIndex
        return selectedIndex
      }
    }

    // For all other tile types, use improved randomization
    // Generate a deterministic but more random variation based on position
    // Better hash function that provides good randomness without visible patterns
    // This ensures the same tile always gets the same variation but without diagonal lines
    let hash = ((x * 73856093) ^ (y * 19349663) ^ ((x + y) * 83492791)) >>> 0
    hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
    hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
    hash = (hash >>> 16) ^ hash
    hash = Math.abs(hash)

    const variationIndex = hash % this.tileTextureCache[tileType].length

    // Store the variation for this position
    this.tileVariationMap[key] = variationIndex

    return variationIndex
  }

  // Check if a land tile at given position uses an impassable grass texture
  isLandTileImpassable(x, y) {
    if (this.integratedSpriteSheetMode) {
      const integratedTile = this.getIntegratedTileForMapTile('land', x, y)
      if (integratedTile?.tags?.includes('impassable')) {
        return true
      }
      if (integratedTile?.tags?.includes('passable') || integratedTile?.tags?.includes('decorative')) {
        return false
      }
    }

    if (!this.grassTileMetadata || !this.allTexturesLoaded) {
      return false // Return false if grass tiles aren't loaded yet
    }

    const key = `land_${x}_${y}`
    let selectedIndex = this.tileVariationMap[key]

    if (selectedIndex === undefined) {
      // Calculate the index if not cached yet
      selectedIndex = this.getTileVariation('land', x, y)
    }

    if (selectedIndex === -1) return false

    const { passableCount, decorativeCount, impassableCount } = this.grassTileMetadata
    const impassableStartIndex = passableCount + decorativeCount
    const totalTextureCount = passableCount + decorativeCount + impassableCount

    // Check if the selected index falls in the impassable range
    return selectedIndex >= impassableStartIndex && selectedIndex < totalTextureCount
  }

  getCurrentWaterFrame() {
    if (!this.waterFrames.length) return null
    const now = performance.now()
    if (now - this.lastWaterFrameTime > 100) {
      this.waterFrameIndex = (this.waterFrameIndex + 1) % this.waterFrames.length
      this.lastWaterFrameTime = now
    }
    return this.waterFrames[this.waterFrameIndex]
  }

  // Export getter for unit image map for compatibility
  getUnitImageMap() {
    return unitImageMap
  }
}
