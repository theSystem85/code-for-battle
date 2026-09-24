// rendering/textureManager.js
import { TILE_SIZE } from '../config.js'
import { buildingImageMap } from '../buildingImageMap.js'
import { getImageTextureWithBlendMode, normalizeSpriteSheetBlendMode } from './spriteSheetAnimation.js'
import { expandCompactSpriteSheetMetadata, hasTaggedSpriteSheetTiles } from '../utils/spriteSheetMetadata.js'
import { decodePreparedImage, estimateDecodedImageBytes, loadPreparedImage } from './prepared/imagePreparation.js'
import { PreparationGeneration } from './prepared/preparedMap.js'

const DEFAULT_COMBAT_DECAL_SHEET_PATH = 'images/map/sprite_sheets/debris_craters_tracks.webp'
const DEFAULT_COMBAT_DECAL_METADATA_PATH = 'images/map/sprite_sheets/debris_craters_tracks.json'
const DEFAULT_CRYSTAL_SHEET_PATH = 'images/map/sprite_sheets/crystals_q90_1024x1024.webp'
const DEFAULT_CRYSTAL_METADATA_PATH = 'images/map/sprite_sheets/crystals_q90_1024x1024.json'
const DEFAULT_STREET_SHEET_PATH = 'images/map/sprite_sheets/streets24_q90_1024x1024.webp'
const DEFAULT_STREET_METADATA_PATH = 'images/map/sprite_sheets/streets24_q90_1024x1024.json'
const LAND_DECORATIVE_INTERVAL = 33
const LAND_IMPASSABLE_INTERVAL = 50
const STREET_DIRECTION_MASKS = {
  top: 1,
  right: 2,
  bottom: 4,
  left: 8
}

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
    this.allTexturesLoaded = false
    this.loadingStarted = false
    this.waterFrames = []
    this.waterFrameIndex = 0
    this.lastWaterFrameTime = 0
    this.integratedSpriteSheetMode = false
    this.integratedSpriteSheetPath = null
    this.integratedSpriteSheetImage = null
    this.primarySpriteSheetImage = null
    this.integratedSpriteSheetMetadata = null
    this.integratedSpriteSheetImagesByPath = {}
    this.integratedSpriteSheetLoadsByPath = {}
    this.integratedSpriteSheets = []
    this.integratedTagBuckets = {}
    this.integratedLandBuckets = {}
    this.integratedBiomeTag = 'grass'
    this.integratedBlendMode = 'black'
    this.integratedBlackKey = null
    this.defaultCombatDecalSheetImage = null
    this.defaultCombatDecalSheetMetadata = null
    this.defaultCombatDecalTagBuckets = {}
    this.defaultCrystalSheetImage = null
    this.defaultCrystalSheetMetadata = null
    this.defaultCrystalTagBuckets = {}
    this.defaultStreetSheetImage = null
    this.defaultStreetSheetMetadata = null
    this.defaultStreetTagBuckets = {}
    this.integratedGroupedTagCatalog = {}
    this.defaultCombatDecalGroupedTagCatalog = {}
    this.streetSelectionPoolCache = new Map()
    this.streetTileSelectionCache = new Map()
    this.integratedConfigVersion = 0
    this.integratedRenderSignature = 'off'
    this.integratedPreparationGeneration = null
    this.texturePreparationGeneration = 0
    this.texturePreparationState = 'idle'
    this.texturePreparationError = null
    this.texturePreparationProgress = { completed: 0, total: 0 }
    this.textureByteUsage = {
      decodedSourceBytes: 0,
      preparedRasterBytes: 0,
      transferBytes: 0,
      gpuStagingBytes: 0
    }
    this.preloadPromise = null
  }

  clearStreetSelectionPoolCache() {
    this.streetSelectionPoolCache.clear()
    this.streetTileSelectionCache.clear()
  }

  buildTagSet(tags) {
    if (!Array.isArray(tags) || !tags.length) return null
    return new Set(tags)
  }

  getStreetDirectionMask(tags, tagSet = null) {
    if (!Array.isArray(tags) || !tags.length) return 0
    const lookup = tagSet || this.buildTagSet(tags)
    if (!lookup) return 0
    let mask = 0
    for (const [directionTag, directionMask] of Object.entries(STREET_DIRECTION_MASKS)) {
      if (lookup.has(directionTag)) {
        mask |= directionMask
      }
    }
    return mask
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
      const tagSet = tile.tagSet || this.buildTagSet(tile.tags)
      if (tagSet && !tile.tagSet) {
        tile.tagSet = tagSet
      }
      const hasRequired = requiredTags.every(tag => tagSet ? tagSet.has(tag) : tile.tags.includes(tag))
      if (!hasRequired) return false
      return excludedTags.every(tag => tagSet ? !tagSet.has(tag) : !tile.tags.includes(tag))
    })
  }

  async loadIntegratedSpriteSheetImage(sheetPath) {
    if (!sheetPath) return null
    if (this.integratedSpriteSheetImagesByPath[sheetPath]) {
      return this.integratedSpriteSheetImagesByPath[sheetPath]
    }
    if (this.integratedSpriteSheetLoadsByPath[sheetPath]) {
      return this.integratedSpriteSheetLoadsByPath[sheetPath]
    }
    const isDirectPath = sheetPath.startsWith('/')
      || sheetPath.startsWith('blob:')
      || sheetPath.startsWith('data:')
      || /^https?:\/\//i.test(sheetPath)
    const source = isDirectPath ? sheetPath : `/${sheetPath}`
    const loading = loadPreparedImage(source)
      .then((image) => {
        this.integratedSpriteSheetImagesByPath[sheetPath] = image
        return image
      })
      .catch(() => null)
      .finally(() => {
        delete this.integratedSpriteSheetLoadsByPath[sheetPath]
      })
    this.integratedSpriteSheetLoadsByPath[sheetPath] = loading
    return loading
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
          tagSet: this.buildTagSet(tile.tags),
          streetDirectionMask: this.getStreetDirectionMask(tile.tags),
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

  buildIntegratedLandBuckets(tagBuckets) {
    const catalog = {}
    for (const biome of ['grass', 'soil', 'sand', 'snow']) {
      catalog[biome] = {
        all: this.getTagBucketCandidates(tagBuckets, [biome]),
        passable: this.getTagBucketCandidates(tagBuckets, [biome, 'passable'], ['decorative', 'impassable']),
        decorative: this.getTagBucketCandidates(tagBuckets, [biome, 'decorative']),
        impassable: this.getTagBucketCandidates(tagBuckets, [biome, 'impassable'])
      }
    }
    return catalog
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
    return hasTaggedSpriteSheetTiles(metadata)
  }

  async preloadDefaultCombatDecalSheet() {
    try {
      const response = await fetch(DEFAULT_COMBAT_DECAL_METADATA_PATH, { cache: 'no-store' })
      if (!response.ok) {
        this.defaultCombatDecalSheetMetadata = null
        this.defaultCombatDecalTagBuckets = {}
        return
      }

      const metadata = expandCompactSpriteSheetMetadata(await response.json())
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

      const metadata = expandCompactSpriteSheetMetadata(await response.json())
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

  async preloadDefaultStreetSheet() {
    try {
      const response = await fetch(DEFAULT_STREET_METADATA_PATH, { cache: 'no-store' })
      if (!response.ok) {
        this.defaultStreetSheetMetadata = null
        this.defaultStreetTagBuckets = {}
        this.clearStreetSelectionPoolCache()
        return
      }

      const metadata = expandCompactSpriteSheetMetadata(await response.json())
      if (!this.hasTaggedIntegratedTiles(metadata)) {
        this.defaultStreetSheetMetadata = null
        this.defaultStreetTagBuckets = {}
        this.clearStreetSelectionPoolCache()
        return
      }

      const image = await this.loadIntegratedSpriteSheetImage(DEFAULT_STREET_SHEET_PATH)
      if (!image) {
        this.defaultStreetSheetMetadata = null
        this.defaultStreetTagBuckets = {}
        this.clearStreetSelectionPoolCache()
        return
      }

      const blendMode = normalizeSpriteSheetBlendMode(metadata?.blendMode)
      const blackKey = metadata?.blackKey || null
      this.defaultStreetSheetImage = image
      this.defaultStreetSheetMetadata = metadata
      this.defaultStreetTagBuckets = this.buildIntegratedTagBuckets([{
        sheetPath: DEFAULT_STREET_SHEET_PATH,
        metadata,
        image,
        blendMode,
        blackKey
      }])
      this.clearStreetSelectionPoolCache()
    } catch (err) {
      this.defaultStreetSheetMetadata = null
      this.defaultStreetTagBuckets = {}
      this.clearStreetSelectionPoolCache()
      window.logger.warn('Failed to preload default street sheet:', err)
    }
  }

  async setIntegratedSpriteSheetConfig(config = {}) {
    this.integratedPreparationGeneration?.cancel('Integrated sprite-sheet preparation superseded')
    const preparation = new PreparationGeneration(++this.texturePreparationGeneration)
    this.integratedPreparationGeneration = preparation
    const enabled = Boolean(config?.enabled)
    const requestedBiomeTag = ['soil', 'sand', 'grass', 'snow', 'mixed'].includes(config?.biomeTag)
      ? config.biomeTag
      : this.integratedBiomeTag
    if (!enabled) {
      preparation.assertCurrent(this.texturePreparationGeneration)
      this.integratedBiomeTag = requestedBiomeTag
      this.integratedSpriteSheetMode = false
      this.primarySpriteSheetImage = null
      this.integratedSpriteSheetMetadata = null
      this.integratedSpriteSheets = []
      this.integratedTagBuckets = {}
      this.integratedLandBuckets = {}
      this.integratedBlendMode = 'black'
      this.integratedBlackKey = null
      this.integratedGroupedTagCatalog = {}
      this.integratedRenderSignature = `off|${this.integratedBiomeTag}`
      this.clearStreetSelectionPoolCache()
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
      const metadata = expandCompactSpriteSheetMetadata(entry?.metadata)
      if (!sheetPath || !metadata) continue
      if (!this.hasTaggedIntegratedTiles(metadata)) continue
      const image = await this.loadIntegratedSpriteSheetImage(sheetPath)
      preparation.assertCurrent(this.texturePreparationGeneration)
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
      preparation.assertCurrent(this.texturePreparationGeneration)
      this.integratedBiomeTag = requestedBiomeTag
      this.integratedSpriteSheetMode = false
      this.primarySpriteSheetImage = null
      this.integratedSpriteSheetMetadata = null
      this.integratedSpriteSheets = []
      this.integratedTagBuckets = {}
      this.integratedLandBuckets = {}
      this.integratedBlendMode = 'black'
      this.integratedBlackKey = null
      this.integratedGroupedTagCatalog = {}
      this.integratedRenderSignature = 'off'
      this.clearStreetSelectionPoolCache()
      this.integratedConfigVersion++
      return
    }

    preparation.assertCurrent(this.texturePreparationGeneration)
    this.integratedSpriteSheetMode = true
    this.integratedSpriteSheets = normalizedEntries
    this.integratedSpriteSheetPath = normalizedEntries[0].sheetPath
    this.integratedSpriteSheetImage = normalizedEntries[0].image
    this.primarySpriteSheetImage = normalizedEntries[0].image
    this.integratedSpriteSheetMetadata = normalizedEntries[0].metadata
    this.integratedTagBuckets = this.buildIntegratedTagBuckets(normalizedEntries)
    this.integratedLandBuckets = this.buildIntegratedLandBuckets(this.integratedTagBuckets)
    this.integratedGroupedTagCatalog = this.buildGroupedTagCatalog(normalizedEntries)
    this.integratedBiomeTag = ['soil', 'sand', 'grass', 'snow', 'mixed'].includes(config?.biomeTag) ? config.biomeTag : 'grass'
    this.integratedBlendMode = normalizeSpriteSheetBlendMode(normalizedEntries[0].metadata?.blendMode)
    this.integratedBlackKey = normalizedEntries[0].blackKey
    const signatureSheets = normalizedEntries
      .map(entry => `${entry.sheetPath}|${entry.metadata?.tileSize}|${entry.metadata?.borderWidth}|${Object.keys(entry.metadata?.tiles || {}).length}|${entry.blendMode}|${entry.blackKey?.cutoffBrightness ?? 'default'}|${entry.blackKey?.softenBrightness ?? 'default'}`)
      .join(';')
    this.integratedRenderSignature = `${signatureSheets}|${this.integratedBiomeTag}`
    this.clearStreetSelectionPoolCache()
    this.integratedConfigVersion++
  }

  static coordHash(x, y) {
    let hash = ((x * 73856093) ^ (y * 19349663) ^ ((x + y) * 83492791)) >>> 0
    hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
    hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
    hash = (hash >>> 16) ^ hash
    return Math.abs(hash)
  }

  getLandClassificationTag(x, y, biomeTag = this.integratedBiomeTag) {
    const requestedBiome = ['soil', 'sand', 'grass', 'snow'].includes(biomeTag)
      ? biomeTag
      : 'grass'
    const hash = TextureManager.coordHash(x, y)
    const landBuckets = this.integratedLandBuckets[requestedBiome]
    const hasImpassable = Boolean(landBuckets?.impassable.length)
    const hasDecorative = Boolean(landBuckets?.decorative.length)
    const hasPassable = Boolean(landBuckets?.passable.length)

    if (hasImpassable && hash % LAND_IMPASSABLE_INTERVAL === 0) return 'impassable'
    if (hasDecorative && hash % LAND_DECORATIVE_INTERVAL === 0) return 'decorative'
    if (hasPassable) return 'passable'
    if (hasDecorative) return 'decorative'
    if (hasImpassable) return 'impassable'
    return 'passable'
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

  selectCrystalTileByTags(requiredTags, x, y, excludedTags = []) {
    const integratedSelection = this.selectIntegratedTileByTags(requiredTags, x, y, excludedTags)
    if (integratedSelection) {
      return integratedSelection
    }

    const defaultCandidates = this.getTagBucketCandidates(this.defaultCrystalTagBuckets || {}, requiredTags, excludedTags)
    if (!defaultCandidates.length) {
      return null
    }
    return this.selectIntegratedTileFromCandidates(defaultCandidates, x, y)
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

  selectIntegratedTileFromCandidates(candidates, x, y) {
    if (!Array.isArray(candidates) || !candidates.length) return null
    return candidates[TextureManager.coordHash(x, y) % candidates.length]
  }

  getStreetNeighborDirectionTags(x, y, mapGrid) {
    return this.getStreetNeighborInfo(x, y, mapGrid).directionTags
  }

  getStreetNeighborInfo(x, y, mapGrid) {
    if (!Array.isArray(mapGrid) || !mapGrid.length) {
      return {
        directionTags: [],
        prefersFull: false
      }
    }
    const mapHeight = mapGrid.length
    const mapWidth = mapGrid[0]?.length || 0
    if (!mapWidth || !mapHeight) {
      return {
        directionTags: [],
        prefersFull: false
      }
    }

    const isStreetTile = (tileX, tileY) => {
      if (tileX < 0 || tileY < 0 || tileX >= mapWidth || tileY >= mapHeight) return false
      const tile = mapGrid[tileY]?.[tileX]
      return tile?.type === 'street'
    }

    const tags = []
    const top = isStreetTile(x, y - 1)
    const bottom = isStreetTile(x, y + 1)
    const left = isStreetTile(x - 1, y)
    const right = isStreetTile(x + 1, y)
    if (top) tags.push('top')
    if (bottom) tags.push('bottom')
    if (left) tags.push('left')
    if (right) tags.push('right')

    const prefersFull = (top && left && isStreetTile(x - 1, y - 1))
      || (top && right && isStreetTile(x + 1, y - 1))
      || (bottom && left && isStreetTile(x - 1, y + 1))
      || (bottom && right && isStreetTile(x + 1, y + 1))

    return {
      directionTags: tags,
      prefersFull
    }
  }

  selectStreetTileFromCandidates(candidates, x, y, neighborTags = [], options = {}) {
    if (!Array.isArray(candidates) || !candidates.length) return null
    const selectionPool = this.getStreetSelectionPoolFromCandidates(candidates, neighborTags, options)
    if (!selectionPool.length) return null
    return selectionPool[TextureManager.coordHash(x, y) % selectionPool.length]
  }

  getStreetSelectionPoolFromCandidates(candidates, neighborTags = [], options = {}) {
    if (!Array.isArray(candidates) || !candidates.length) return []
    const validDirectionTags = new Set(neighborTags)
    const neighborMask = this.getStreetDirectionMask(neighborTags, validDirectionTags)
    return candidates.filter((tile) => {
      if (!Array.isArray(tile?.tags) || !tile.rect) return false
      const tagSet = tile.tagSet || this.buildTagSet(tile.tags)
      if (tagSet && !tile.tagSet) {
        tile.tagSet = tagSet
      }
      const hasFullTag = tagSet ? tagSet.has('full') : tile.tags.includes('full')
      if (!options.allowFull && hasFullTag) return false
      if (options.allowFull && !hasFullTag) return false
      if (options.ignoreDirectionalExactMatch) return true

      const tileDirectionMask = Number.isFinite(tile.streetDirectionMask)
        ? tile.streetDirectionMask
        : this.getStreetDirectionMask(tile.tags, tagSet)
      if (!Number.isFinite(tile.streetDirectionMask)) {
        tile.streetDirectionMask = tileDirectionMask
      }
      return tileDirectionMask === neighborMask
    })
  }

  getStreetSelectionPoolCacheKey(requiredTags, excludedTags, neighborInfo, options = {}) {
    const requiredKey = [...requiredTags].sort().join(',')
    const excludedKey = [...excludedTags].sort().join(',')
    const directionKey = [...(neighborInfo?.directionTags || [])].sort().join(',')
    const prefersFullKey = neighborInfo?.prefersFull ? '1' : '0'
    const fullKey = options.allowFull ? '1' : '0'
    const ignoreDirectionKey = options.ignoreDirectionalExactMatch ? '1' : '0'
    return [
      this.integratedRenderSignature,
      this.integratedBiomeTag || '',
      requiredKey,
      excludedKey,
      directionKey,
      prefersFullKey,
      fullKey,
      ignoreDirectionKey
    ].join('|')
  }

  getStreetSelectionPool(requiredTags, excludedTags, neighborInfo, options = {}) {
    const cacheKey = this.getStreetSelectionPoolCacheKey(requiredTags, excludedTags, neighborInfo, options)
    const cached = this.streetSelectionPoolCache.get(cacheKey)
    if (cached) return cached

    const neighborTags = neighborInfo?.directionTags || []
    const biomeTag = this.integratedBiomeTag
    const candidateGroups = [
      this.getTagBucketCandidates(this.integratedTagBuckets || {}, [...requiredTags, biomeTag], excludedTags),
      this.getTagBucketCandidates(this.integratedTagBuckets || {}, requiredTags, excludedTags),
      this.getTagBucketCandidates(this.defaultStreetTagBuckets || {}, [...requiredTags, biomeTag], excludedTags),
      this.getTagBucketCandidates(this.defaultStreetTagBuckets || {}, requiredTags, excludedTags)
    ]
    let selectionPool = []
    for (const candidates of candidateGroups) {
      const filtered = this.getStreetSelectionPoolFromCandidates(candidates, neighborTags, options)
      if (filtered.length) {
        selectionPool = filtered
        break
      }
    }
    this.streetSelectionPoolCache.set(cacheKey, selectionPool)
    return selectionPool
  }

  selectStreetTileByTags(requiredTags, x, y, mapGrid, excludedTags = []) {
    const neighborInfo = this.getStreetNeighborInfo(x, y, mapGrid)
    const topologyMask = this.getStreetDirectionMask(neighborInfo.directionTags)
    const tileCacheKey = [
      this.integratedRenderSignature,
      this.integratedBiomeTag,
      x,
      y,
      topologyMask,
      neighborInfo.prefersFull ? 1 : 0,
      requiredTags.join(','),
      excludedTags.join(',')
    ].join('|')
    if (this.streetTileSelectionCache.has(tileCacheKey)) {
      return this.streetTileSelectionCache.get(tileCacheKey)
    }

    const selectFromBuckets = (tags, options = {}) => {
      const pool = this.getStreetSelectionPool(tags, excludedTags, neighborInfo, options)
      if (!pool.length) return null
      return pool[TextureManager.coordHash(x, y) % pool.length]
    }

    if (neighborInfo.prefersFull) {
      const fullMatch = selectFromBuckets([...requiredTags, 'full'], {
        allowFull: true,
        ignoreDirectionalExactMatch: true
      })
      if (fullMatch) {
        this.streetTileSelectionCache.set(tileCacheKey, fullMatch)
        return fullMatch
      }
    }

    const selected = selectFromBuckets(requiredTags)
    this.streetTileSelectionCache.set(tileCacheKey, selected)
    return selected
  }

  selectFullStreetTileForSOT(x, y, excludedTags = []) {
    const biomeTag = this.integratedBiomeTag
    const selectFullCandidate = (buckets, tags) => this.selectStreetTileFromCandidates(
      this.getTagBucketCandidates(buckets || {}, tags, excludedTags),
      x,
      y,
      [],
      {
        allowFull: true,
        ignoreDirectionalExactMatch: true
      }
    )

    return selectFullCandidate(this.integratedTagBuckets, ['street', 'full', biomeTag])
      || selectFullCandidate(this.integratedTagBuckets, ['street', 'full'])
      || selectFullCandidate(this.defaultStreetTagBuckets, ['street', 'full', biomeTag])
      || selectFullCandidate(this.defaultStreetTagBuckets, ['street', 'full'])
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
    if (type === 'street') {
      const mapGrid = options?.mapGrid
      const selectedStreetTile = this.selectStreetTileByTags(['street'], x, y, mapGrid)
      if (!selectedStreetTile?.rect) return null
      return {
        image: selectedStreetTile.image || this.integratedSpriteSheetImage || this.defaultStreetSheetImage,
        rect: selectedStreetTile.rect,
        tags: selectedStreetTile.tags || [],
        sheetPath: selectedStreetTile.sheetPath || null
      }
    }

    if (!this.integratedSpriteSheetMode || !this.integratedSpriteSheetImage || !this.integratedSpriteSheetMetadata) {
      return null
    }

    let selected = null
    const mapGrid = options?.mapGrid

    if (type === 'land') {
      const requestedBiome = ['soil', 'sand', 'grass', 'snow'].includes(options?.biomeTag)
        ? options.biomeTag
        : (this.integratedBiomeTag === 'mixed' ? 'grass' : this.integratedBiomeTag)
      const landBuckets = this.integratedLandBuckets[requestedBiome]
      const classification = this.getLandClassificationTag(x, y, requestedBiome)
      if (classification === 'decorative') {
        if (mapGrid) {
          selected = this.selectGroupedTileForMapTile('decorative', x, y, mapGrid, (cellX, cellY) => {
            const tile = mapGrid[cellY]?.[cellX]
            return tile?.type === 'land' && this.getLandClassificationTag(cellX, cellY, requestedBiome) === 'decorative'
          })
        }
        if (landBuckets?.decorative.length) {
          selected = selected || this.selectIntegratedTileFromCandidates(landBuckets.decorative, x, y)
        }
      } else if (classification === 'impassable') {
        selected = this.selectIntegratedTileFromCandidates(landBuckets?.impassable, x, y)
      } else {
        selected = this.selectIntegratedTileFromCandidates(landBuckets?.passable, x, y)
      }
      selected = selected || this.selectIntegratedTileFromCandidates(
        landBuckets?.all,
        x,
        y
      )
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
      img.onload = async() => {
        try {
          await decodePreparedImage(img)
          // Cache only decoded images. This prevents an onload callback from
          // publishing an asset generation that is not renderable yet.
          this.imageCache[baseName] = img
          console.debug(`✅ Successfully loaded: ${baseName}.${extensions[index]}`)

          while (this.loadingImages[baseName].length > 0) {
            const cb = this.loadingImages[baseName].shift()
            cb(img)
          }
          delete this.loadingImages[baseName]
        } catch {
          tryLoadImage(baseName, extensions, index + 1)
        }
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
    if (this.preloadPromise) {
      const result = await this.preloadPromise
      if (callback) callback()
      return result
    }
    this.loadingStarted = true
    this.allTexturesLoaded = false
    this.texturePreparationState = 'preparing'
    this.texturePreparationError = null
    this.texturePreparationProgress.completed = 0
    this.texturePreparationProgress.total = 4

    this.preloadPromise = (async() => {
      try {
        const waterImg = await loadPreparedImage('images/map/water_spritesheet.webp')
        this.texturePreparationProgress.completed++

        // Water remains a separate animated frame set. These frames are
        // prepared before readiness and are never included in static pages.
        const waterFrames = []
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
          waterFrames.push(canvas)
        }

        await Promise.all([
          this.preloadDefaultCombatDecalSheet(),
          this.preloadDefaultCrystalSheet(),
          this.preloadDefaultStreetSheet()
        ])
        this.texturePreparationProgress.completed += 3

        // Publish one complete texture generation after every source decoded
        // and every finite prepared variant was built.
        this.waterFrames = waterFrames
        const decodedImages = new Set([
          waterImg,
          this.defaultCombatDecalSheetImage,
          this.defaultCrystalSheetImage,
          this.defaultStreetSheetImage
        ].filter(Boolean))
        this.textureByteUsage = {
          decodedSourceBytes: [...decodedImages].reduce((total, image) => total + estimateDecodedImageBytes(image), 0),
          preparedRasterBytes: waterFrames.length * TILE_SIZE * TILE_SIZE * 4,
          transferBytes: 0,
          gpuStagingBytes: 0
        }
        this.allTexturesLoaded = true
        this.texturePreparationState = 'ready'
        return this
      } catch (error) {
        this.loadingStarted = false
        this.allTexturesLoaded = false
        this.texturePreparationState = 'failed'
        this.texturePreparationError = error
        throw error
      }
    })()

    try {
      const result = await this.preloadPromise
      if (callback) callback()
      return result
    } finally {
      if (!this.allTexturesLoaded) this.preloadPromise = null
    }
  }

  getPreparationProgress() {
    return {
      state: this.texturePreparationState,
      error: this.texturePreparationError,
      ...this.texturePreparationProgress
    }
  }

  getPreparedTerrainAssets() {
    return [
      { key: 'water-animation-source', image: null, animated: true, frames: this.waterFrames },
      { key: 'combat-decals', image: this.defaultCombatDecalSheetImage, animated: false },
      { key: 'crystals', image: this.defaultCrystalSheetImage, animated: false },
      { key: 'streets', image: this.defaultStreetSheetImage, animated: false }
    ].filter(asset => asset.image || asset.frames?.length)
  }

  retryPreloadAllTextures(callback) {
    if (this.texturePreparationState !== 'failed') return this.preloadPromise || Promise.resolve(this)
    return this.preloadAllTextures(callback)
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
