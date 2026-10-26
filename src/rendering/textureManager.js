import { fetchAssetJson } from '../utils/assetLoading.js'
import { computeMapTopologyFingerprint } from '../game/mapTopology.js'
import { prepareCityBuildings } from '../game/cityBuildings.js'
import { normalizeDecorationSettings } from '../game/decorationSettings.js'
// rendering/textureManager.js
import { TILE_SIZE, PLAYER_POSITIONS } from '../config.js'
import { gameState } from '../gameState.js'
import { bootMark } from '../ui/bootTiming.js'
import { reportBootTextures } from '../ui/bootProgress.js'
import { buildingImageMap } from '../buildingImageMap.js'
import { getImageTextureWithBlendMode, normalizeSpriteSheetBlendMode } from './spriteSheetAnimation.js'
import { expandCompactSpriteSheetMetadata, hasTaggedSpriteSheetTiles } from '../utils/spriteSheetMetadata.js'
import { estimateDecodedImageBytes, loadPreparedImage } from './prepared/imagePreparation.js'
import { PreparationGeneration } from './prepared/preparedMap.js'
import {
  buildDecorationPools,
  decorationHash,
  decorationSeed,
  getValidDecorationCell,
  SINGLE_DECORATION_INTERVAL
} from './decorationLayout.js'
import { cityFootprintGroup, prepareCityVisual } from './cityOverhangs.js'
import { getPreparedSpriteState } from './prepared/preparedSpritePipeline.js'
import { cutoutDecorationGroup } from './decorationCutout.js'
import { DecorationLayoutPreparation } from './decorationLayoutPreparation.js'
import { createSpritePublication, createSpriteReservationToken } from './spriteStreamingLifecycle.js'
import { loadSpriteSheetsWithOverlap } from '../pwa/offlineAssetPlan.js'
import {
  getSpriteResourceLifecycleGenerations,
  getSpriteResourceLifecycleStore,
  onSpriteResourceLifecycleTeardown
} from './prepared/spriteResourceLifecycle.js'
import { cacheActiveMapSpriteRepresentations } from './prepared/mapSpriteOfflineCache.js'

const PREPARED_MAP_SPRITE_ROOT = '/images/prepared-map-sprites/'

const DEFAULT_COMBAT_DECAL_SHEET_PATH = 'images/map/sprite_sheets/debris_craters_tracks.webp'
const DEFAULT_COMBAT_DECAL_METADATA_PATH = 'images/map/sprite_sheets/debris_craters_tracks.json'
const DEFAULT_CRYSTAL_SHEET_PATH = 'images/map/sprite_sheets/crystals_q90_1024x1024.webp'
const DEFAULT_CRYSTAL_METADATA_PATH = 'images/map/sprite_sheets/crystals_q90_1024x1024.json'
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
  lightTank: 'images/map/units/lightTank_wagon.webp',
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
    this.preparedMapSpriteCatalog = null
    this.preparedMapSpriteCatalogPromise = null
    this.preparedMapSpriteManifests = new Map()
    this.spritePublicationRevision = 0
    this.onSpriteTierPublication = null
    // sheetPath -> { store, resourceId, owner } in the shared lifecycle store.
    this.preparedMapSpriteResources = new Map()
    this.preparedMapSpriteTeardown = null
    this.offlineMapSpriteSelectionKey = ''
    this.offlineMapSpriteCaching = null
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
    this.defaultStreetTagBuckets = {}
    this.integratedGroupedTagCatalog = {}
    this.integratedDecorationPools = buildDecorationPools([])
    this.hasGroundDetails = false
    this.naturalDecorationRules = false
    this.decorationLayoutCache = null
    this.decorationLayoutPreparation = new DecorationLayoutPreparation()
    this.decorationMapRevision = 0
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
      .catch(() => {
        console.warn(`Skipping unavailable sprite sheet: ${sheetPath}`)
        return null
      })
      .finally(() => {
        delete this.integratedSpriteSheetLoadsByPath[sheetPath]
      })
    this.integratedSpriteSheetLoadsByPath[sheetPath] = loading
    return loading
  }

  async loadPreparedMapSpriteCatalog() {
    if (this.preparedMapSpriteCatalog) return this.preparedMapSpriteCatalog
    if (!this.preparedMapSpriteCatalogPromise) {
      this.preparedMapSpriteCatalogPromise = fetchAssetJson(`${PREPARED_MAP_SPRITE_ROOT}catalog.json`)
        .then(catalog => {
          this.preparedMapSpriteCatalog = catalog
          return catalog
        })
        .catch(() => null)
        .finally(() => { this.preparedMapSpriteCatalogPromise = null })
    }
    return this.preparedMapSpriteCatalogPromise
  }

  async loadPreparedMapSpriteSheet(sheetPath, tierName = 'final') {
    const name = sheetPath.split('/').pop()?.replace(/\.[^.]+$/, '')
    if (!name || !sheetPath.startsWith('images/map/sprite_sheets/')) return null
    const catalog = await this.loadPreparedMapSpriteCatalog()
    const catalogEntry = catalog?.sheets?.find(sheet => sheet.name === name)
    if (!catalogEntry) return null
    let manifest = this.preparedMapSpriteManifests.get(name)
    if (!manifest) {
      manifest = await fetchAssetJson(`${PREPARED_MAP_SPRITE_ROOT}${catalogEntry.manifest}`)
      this.preparedMapSpriteManifests.set(name, manifest)
    }
    const finalPage = manifest.pages?.find(candidate => candidate.tierName === 'final') || manifest.pages?.at(-1)
    const pageUrl = candidate => candidate.url || `${PREPARED_MAP_SPRITE_ROOT.slice(1)}${candidate.name}`
    // A reconfiguration never downgrades a sheet whose final page is already
    // decoded; coarse-first only applies to sheets not yet resident.
    const finalResident = finalPage && this.integratedSpriteSheetImagesByPath[pageUrl(finalPage)]
    const page = (finalResident ? finalPage : null) ||
      manifest.pages?.find(candidate => candidate.tierName === tierName) || finalPage
    if (!page) return null
    const image = await this.loadIntegratedSpriteSheetImage(pageUrl(page))
    if (!image) return null
    return { catalogEntry, manifest, page, image }
  }

  buildPreparedMapSpriteMetadata(metadata, prepared) {
    const tiles = {}
    for (const sprite of prepared.manifest.sprites || []) {
      const source = sprite.sources?.find(candidate => candidate.tier === prepared.page.tier)
      if (!source) continue
      const columns = Math.max(1, Math.round(sprite.logicalWidth / (metadata.tileSize || 64)))
      const rows = Math.max(1, Math.round(sprite.logicalHeight / (metadata.tileSize || 64)))
      const tileWidth = source.width / columns
      const tileHeight = source.height / rows
      const coordinates = (sprite.tileKeys || []).map(value => value.split(',').map(Number))
      const groupColumn = Math.min(...coordinates.map(([column]) => column))
      const groupRow = Math.min(...coordinates.map(([, row]) => row))
      for (const key of sprite.tileKeys || []) {
        const original = metadata.tiles?.[key]
        if (!original) continue
        const [column, row] = key.split(',').map(Number)
        tiles[key] = {
          ...original,
          spriteId: prepared.manifest.source.image,
          spriteRecordId: sprite.spriteId,
          logicalWidth: sprite.logicalWidth,
          logicalHeight: sprite.logicalHeight,
          anchorX: sprite.anchorX,
          anchorY: sprite.anchorY,
          metadataSignature: prepared.manifest.identity.metadataSignature,
          signature: prepared.manifest.signature,
          rect: { x: source.x + (column - groupColumn) * tileWidth, y: source.y + (row - groupRow) * tileHeight, width: tileWidth, height: tileHeight },
          tierRect: source
        }
      }
    }
    return { ...metadata, blendMode: 'alpha', tiles }
  }

  publishPreparedMapSpriteSheet(sheetPath, prepared) {
    const generation = this.integratedConfigVersion + 1
    const publication = createSpritePublication({
      spriteId: sheetPath,
      tier: prepared.page.tier,
      revision: ++this.spritePublicationRevision,
      generations: { asset: generation, map: this.decorationMapRevision, density: 0 },
      resourceToken: createSpriteReservationToken({ tokenId: `${prepared.manifest.signature}:${prepared.page.tier}`, owner: sheetPath, byteClass: 'resident', bytes: prepared.page.decodedBytes, generation })
    })
    this.chargePreparedMapSpritePage(sheetPath, prepared, publication.revision)
    this.onSpriteTierPublication?.(publication)
    return publication
  }

  /** Charges the selected page's decoded bytes to the shared lifecycle store
   * and publishes it there, so map sprites share totals with unit sprites,
   * explosions and streamed tiers. Accounting failure never blocks rendering. */
  chargePreparedMapSpritePage(sheetPath, prepared, revision) {
    const bytes = Number(prepared?.page?.decodedBytes)
    if (!Number.isSafeInteger(bytes) || bytes <= 0) return null
    const store = getSpriteResourceLifecycleStore()
    if (!this.preparedMapSpriteTeardown) {
      this.preparedMapSpriteTeardown = onSpriteResourceLifecycleTeardown(() => {
        for (const record of this.preparedMapSpriteResources.values()) record.owner?.release()
        this.preparedMapSpriteResources.clear()
      })
    }
    const resourceId = `map-sprite:${prepared.manifest.signature}:${prepared.page.tier}`
    const current = this.preparedMapSpriteResources.get(sheetPath)
    if (current?.store === store && current.resourceId === resourceId) return current
    this.releasePreparedMapSpriteResource(sheetPath)
    try {
      // The decoded image is owned by the integrated-sheet image cache; the
      // store only accounts it. Holding the owner reference prevents eviction
      // while the page is the active representation.
      const owner = store.resources.has(resourceId)
        ? store.acquire(resourceId)
        : store.registerResource({
          resourceId,
          value: { sheetPath },
          allocations: [{ byteClass: 'resident', bytes }],
          tier: prepared.page.tier,
          kind: 'map-sprite-page'
        })
      if (!owner) return null
      store.publish(`map-sprite:${sheetPath}`, {
        resourceId,
        revision,
        tier: prepared.page.tier,
        generations: getSpriteResourceLifecycleGenerations(store)
      })
      const record = { store, resourceId, owner }
      this.preparedMapSpriteResources.set(sheetPath, record)
      return record
    } catch (error) {
      window.logger?.warn?.('Prepared map-sprite page exceeds the shared sprite budget:', error)
      return null
    }
  }

  releasePreparedMapSpriteResource(sheetPath) {
    const record = this.preparedMapSpriteResources.get(sheetPath)
    if (!record) return
    this.preparedMapSpriteResources.delete(sheetPath)
    record.owner?.release()
    if (record.store.disposed) return
    record.store.remove(`map-sprite:${sheetPath}`)
    record.store.disposeResource(record.resourceId, 'map-sprite-page-replaced')
  }

  releaseInactivePreparedMapSpriteResources(activeSheetPaths = []) {
    const active = new Set(activeSheetPaths)
    for (const sheetPath of [...this.preparedMapSpriteResources.keys()]) {
      if (!active.has(sheetPath)) this.releasePreparedMapSpriteResource(sheetPath)
    }
  }

  /** S09: after the active density and the final tier are known, retain only
   * the minimum coarse tier plus the selected final page per active sheet in
   * the derivative cache and drop stale derivatives. Runs in the background. */
  scheduleOfflineMapSpriteCaching(manifests, density) {
    if (!manifests.length || typeof globalThis.caches?.open !== 'function') return null
    const key = `${density}|${manifests.map(manifest => manifest.signature).sort().join(',')}`
    if (key === this.offlineMapSpriteSelectionKey) return this.offlineMapSpriteCaching
    this.offlineMapSpriteSelectionKey = key
    this.offlineMapSpriteCaching = cacheActiveMapSpriteRepresentations(manifests, { density })
      .catch(error => {
        if (this.offlineMapSpriteSelectionKey === key) this.offlineMapSpriteSelectionKey = ''
        window.logger?.warn?.('Offline map-sprite caching failed:', error)
        return null
      })
    return this.offlineMapSpriteCaching
  }

  getActivePreparedSpriteDensity() {
    return getPreparedSpriteState().density || Math.min(3, Math.max(1, Math.ceil(globalThis.devicePixelRatio || 1)))
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
          image: getImageTextureWithBlendMode(entry.image, entry.blendMode, entry.blackKey, entry.metadata),
          blendMode: entry.blendMode,
          blackKey: entry.blackKey,
          sheetPath: entry.sheetPath
        }
        tile.tags.forEach((tag) => {
          // Decorative rocks are props, never terrain replacements.
          if ((tag === 'rock' || tag === 'rocks') && (tile.tags.includes('decorative') || tile.tags.includes('ground_detail'))) return
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
        passable: this.getTagBucketCandidates(tagBuckets, [biome, 'passable'], ['decorative', 'impassable', 'ground_detail']),
        decorative: this.getTagBucketCandidates(tagBuckets, [biome, 'decorative']),
        impassable: this.getTagBucketCandidates(tagBuckets, [biome, 'impassable'])
      }
    }
    catalog.universal = {
      decorative: this.getTagBucketCandidates(tagBuckets, ['universal', 'decorative']),
      impassable: this.getTagBucketCandidates(tagBuckets, ['universal', 'impassable'])
    }
    for (const biome of ['grass', 'soil', 'sand', 'snow']) {
      // Universal props only supplement biomes that have their own decorative art.
      catalog[biome].decorativeWithUniversal = catalog[biome].decorative.length
        ? catalog[biome].decorative.concat(catalog.universal.decorative)
        : catalog.universal.decorative
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
          image: getImageTextureWithBlendMode(entry.image, entry.blendMode, entry.blackKey, entry.metadata),
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
      const metadata = expandCompactSpriteSheetMetadata(await fetchAssetJson(DEFAULT_COMBAT_DECAL_METADATA_PATH))
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
      const metadata = expandCompactSpriteSheetMetadata(await fetchAssetJson(DEFAULT_CRYSTAL_METADATA_PATH))
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
    this.integratedPreparationGeneration?.cancel('Integrated sprite-sheet preparation superseded')
    const preparation = new PreparationGeneration(++this.texturePreparationGeneration)
    this.integratedPreparationGeneration = preparation
    const enabled = Boolean(config?.enabled) && !(Array.isArray(config.sheets) && config.sheets.length === 0)
    const preparedTier = config.preparedTier === 'final' ? 'final' : 'coarse'
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
      this.integratedDecorationPools = buildDecorationPools([])
      this.hasGroundDetails = false
      this.naturalDecorationRules = false
      this.decorationLayoutCache = null
      this.integratedRenderSignature = `off|${this.integratedBiomeTag}`
      this.releaseInactivePreparedMapSpriteResources([])
      this.clearStreetSelectionPoolCache()
      this.integratedConfigVersion++
      return
    }

    if (Array.isArray(config?.sheets) && config.sheets.length) {
      this.lastIntegratedSheetEntries = config.sheets
    }
    // A single-sheet request without a usable sheet (for example a saved game
    // restored with custom mode on) keeps the current multi-sheet selection
    // instead of silently switching custom mode off.
    const hasSingleSheet = Boolean(config?.sheetPath && config?.metadata)
    const sheetEntries = Array.isArray(config?.sheets) && config.sheets.length
      ? config.sheets
      : (!hasSingleSheet && this.lastIntegratedSheetEntries?.length
        ? this.lastIntegratedSheetEntries
        : [{
          sheetPath: config?.sheetPath,
          metadata: config?.metadata
        }])

    const normalizedEntries = []
    const candidates = []
    for (const entry of sheetEntries) {
      const sheetPath = entry?.sheetPath
      const metadata = expandCompactSpriteSheetMetadata(entry?.metadata)
      if (!sheetPath || !metadata) continue
      if (!this.hasTaggedIntegratedTiles(metadata)) continue
      candidates.push({ sheetPath, metadata })
    }
    // Bounded overlap hides per-sheet network latency; a selected derivative
    // never also requests its source sheet. Results keep declaration order.
    const loaded = await loadSpriteSheetsWithOverlap(candidates, async({ sheetPath }) => {
      const prepared = await this.loadPreparedMapSpriteSheet(sheetPath, preparedTier)
      const image = prepared?.image || await this.loadIntegratedSpriteSheetImage(sheetPath)
      return { prepared, image }
    })
    preparation.assertCurrent(this.texturePreparationGeneration)
    for (let index = 0; index < candidates.length; index++) {
      const { sheetPath, metadata } = candidates[index]
      const { prepared, image } = loaded[index] || {}
      if (!image) continue
      const preparedMetadata = prepared ? this.buildPreparedMapSpriteMetadata(metadata, prepared) : metadata
      normalizedEntries.push({
        sheetPath,
        metadata: preparedMetadata,
        image,
        blendMode: prepared ? 'alpha' : normalizeSpriteSheetBlendMode(metadata?.blendMode),
        blackKey: prepared ? null : metadata?.blackKey || null,
        preparedManifest: prepared?.manifest || null,
        preparedTier: prepared?.page?.tier ?? null
      })
      if (prepared) this.publishPreparedMapSpriteSheet(sheetPath, prepared)
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
      this.integratedDecorationPools = buildDecorationPools([])
      this.hasGroundDetails = false
      this.naturalDecorationRules = false
      this.decorationLayoutCache = null
      this.integratedRenderSignature = 'off'
      this.releaseInactivePreparedMapSpriteResources([])
      this.clearStreetSelectionPoolCache()
      this.integratedConfigVersion++
      return
    }

    preparation.assertCurrent(this.texturePreparationGeneration)
    normalizedEntries.sort((a, b) => a.sheetPath < b.sheetPath ? -1 : a.sheetPath > b.sheetPath ? 1 : 0)
    this.integratedSpriteSheetMode = true
    this.integratedSpriteSheets = normalizedEntries
    this.integratedSpriteSheetPath = normalizedEntries[0].sheetPath
    this.integratedSpriteSheetImage = normalizedEntries[0].image
    this.primarySpriteSheetImage = normalizedEntries[0].image
    this.integratedSpriteSheetMetadata = normalizedEntries[0].metadata
    this.integratedTagBuckets = this.buildIntegratedTagBuckets(normalizedEntries)
    this.integratedLandBuckets = this.buildIntegratedLandBuckets(this.integratedTagBuckets)
    this.integratedGroupedTagCatalog = this.buildGroupedTagCatalog(normalizedEntries)
    const decorationGroups = [...(this.integratedGroupedTagCatalog.decorative || []), ...(this.integratedGroupedTagCatalog.ground_detail || [])]
    const seenGroups = new Set()
    const preparedGroups = []
    for (const group of decorationGroups) {
      const first = group.tilesByOffset['0,0']
      const key = `${first.sheetPath}:${group.groupLabel}`
      if (seenGroups.has(key)) continue
      seenGroups.add(key)
      const tagSet = TextureManager.collectGroupTagSet(group)
      const alphaReady = Boolean(first.metadataSignature)
      preparedGroups.push(cityFootprintGroup({ ...(tagSet.has('ground_detail') || alphaReady ? group : cutoutDecorationGroup(group)), tagSet }))
    }
    // Optional prop and detail sheets may carry ungrouped 1x1 tiles.
    const singles = new Set([...(this.integratedTagBuckets.decorative || []), ...(this.integratedTagBuckets.ground_detail || [])])
    for (const tile of singles) {
      if (TextureManager.getGroupTagId(tile.tags)) continue
      const group = { width: 1, height: 1, tilesByOffset: { '0,0': tile }, tagSet: new Set(tile.tags) }
      preparedGroups.push(tile.tags.includes('ground_detail') || tile.metadataSignature ? group : cutoutDecorationGroup(group))
    }
    this.cityVisualGroups = preparedGroups.filter(group => group.cityVisual)
    this.cityVisualDensity = 0
    const activeDensity = this.getActivePreparedSpriteDensity()
    this.prepareCityVisuals(activeDensity)
    this.releaseInactivePreparedMapSpriteResources(normalizedEntries.filter(entry => entry.preparedManifest).map(entry => entry.sheetPath))
    this.scheduleOfflineMapSpriteCaching(normalizedEntries.map(entry => entry.preparedManifest).filter(Boolean), activeDensity)
    this.hasShoreDecorations = preparedGroups.some(group => group.tagSet.has('shore'))
    this.integratedDecorationPools = buildDecorationPools(preparedGroups)
    this.hasGroundDetails = preparedGroups.some(group => group.tagSet.has('ground_detail'))
    this.naturalDecorationRules = normalizedEntries.some(entry => /\/dtv\d+_/.test(entry.sheetPath))
    const previousLayoutMap = this.decorationLayoutPreparation.published?.mapGrid || null
    this.decorationLayoutCache = null
    this.integratedBiomeTag = ['soil', 'sand', 'grass', 'snow', 'mixed'].includes(config?.biomeTag) ? config.biomeTag : 'grass'
    this.integratedBlendMode = normalizeSpriteSheetBlendMode(normalizedEntries[0].metadata?.blendMode)
    this.integratedBlackKey = normalizedEntries[0].blackKey
    const signatureSheets = normalizedEntries
      .map(entry => entry.preparedManifest
        ? `${entry.sheetPath}|${entry.preparedManifest.identity.metadataSignature}|${entry.preparedManifest.signature}`
        : `${entry.sheetPath}|${entry.metadata?.tileSize}|${entry.metadata?.borderWidth}|${Object.keys(entry.metadata?.tiles || {}).length}|${entry.blendMode}|${entry.blackKey?.cutoffBrightness ?? 'default'}|${entry.blackKey?.softenBrightness ?? 'default'}`)
      .join(';')
    this.integratedRenderSignature = `${signatureSheets}|${this.integratedBiomeTag}|${computeMapTopologyFingerprint({ enabled: true, sheets: normalizedEntries, ...gameState })}`
    this.clearStreetSelectionPoolCache()
    this.integratedConfigVersion++
    if (preparedTier === 'final' && previousLayoutMap) this.prepareDecorationLayout(previousLayoutMap)

    // Publish the existing coarse derivatives first, then let the same
    // configuration lifecycle replace them atomically with final pages. The
    // renderer keeps already-published chunk canvases visible during this
    // asset-only revision, so placement never blinks or changes size.
    if (preparedTier === 'coarse' && normalizedEntries.some(entry => entry.preparedTier === 0)) {
      const generation = preparation.generation
      Promise.resolve().then(() => {
        if (this.integratedPreparationGeneration?.generation !== generation) return null
        return this.setIntegratedSpriteSheetConfig({ ...config, preparedTier: 'final' })
      }).catch(error => window.logger?.warn?.('Final map-sprite tier upgrade failed:', error))
    }
  }

  static coordHash(x, y) {
    let hash = ((x * 73856093) ^ (y * 19349663) ^ ((x + y) * 83492791)) >>> 0
    hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
    hash = ((hash >>> 16) ^ hash) * 0x45d9f3b
    hash = (hash >>> 16) ^ hash
    return Math.abs(hash)
  }

  // Explicit configuration/density lifecycle only; never invoked by rendering.
  prepareCityVisuals(density) {
    if (this.cityVisualDensity === density) return
    const groups = this.cityVisualGroups || []
    const bytes = groups.reduce((sum, group) => sum + Math.round(group.cityVisual.width * density) * Math.round(group.cityVisual.height * density) * 4, 0)
    if (bytes > 64 * 1024 * 1024) throw new Error('City visuals exceed the 64 MiB preparation budget')
    const prepared = groups.map(group => prepareCityVisual(group.cityVisual, density))
    groups.forEach((group, index) => { group.cityVisual.sprite = prepared[index] })
    this.cityVisualDensity = density
    this.cityVisualBytes = bytes
  }

  getDefaultDecorationBiome() {
    return ['soil', 'sand', 'grass', 'snow'].includes(this.integratedBiomeTag) ? this.integratedBiomeTag : 'grass'
  }

  /**
   * Decoration layout for the given map, built once per map grid and sheet
   * configuration: multi-tile sprites first, then 1x1 sprites.
   */
  getDecorationLayout(mapGrid) {
    if (!Array.isArray(mapGrid) || !mapGrid.length) return null
    const decorationSettings = normalizeDecorationSettings(gameState)
    const decorationKey = JSON.stringify(decorationSettings)
    return this.decorationLayoutPreparation.read({
      mapGrid,
      mapRevision: this.decorationMapRevision,
      catalogRevision: this.integratedConfigVersion,
      configRevision: `${gameState.mapSeed}:${decorationKey}`
    })
  }

  prepareDecorationLayout(mapGrid) {
    if (!Array.isArray(mapGrid) || !mapGrid.length) return null
    const width = mapGrid[0]?.length || 0
    const decorationSettings = normalizeDecorationSettings(gameState)
    const decorationKey = JSON.stringify(decorationSettings)
    return this.decorationLayoutPreparation.prepare({
      mapGrid,
      pools: this.integratedDecorationPools,
      mapRevision: this.decorationMapRevision,
      catalogRevision: this.integratedConfigVersion,
      configRevision: `${gameState.mapSeed}:${decorationKey}`,
      options: {
        defaultBiome: this.getDefaultDecorationBiome(),
        ruinSeed: gameState.mapSeed,
        ...decorationSettings,
        salt: this.naturalDecorationRules ? decorationSeed(gameState.mapSeed) : 0,
        placementRules: Boolean(this.naturalDecorationRules),
        startPositions: Object.values(PLAYER_POSITIONS).slice(0, gameState.playerCount || 2).map(point => ({ x: Math.floor(width * point.x), y: Math.floor(mapGrid.length * point.y) }))
      },
      applySimulationEffects: prepareCityBuildings
    }).layout
  }

  /**
   * Lifecycle helper for configuration phases (sheet apply, save restore):
   * reuse the published layout when it still matches, otherwise prepare it.
   * Never call from render lookups.
   */
  ensureDecorationLayout(mapGrid) {
    if (!this.integratedSpriteSheetMode) return null
    return this.getDecorationLayout(mapGrid) || this.prepareDecorationLayout(mapGrid)
  }

  getGroundDetailForMapTile(mapGrid, x, y) {
    if (!this.integratedSpriteSheetMode || !this.hasGroundDetails || mapGrid?.[y]?.[x]?.type !== 'land') return null
    const layout = this.getDecorationLayout(mapGrid)
    const cell = layout?.groundDetails?.[y * layout.width + x]
    if (!cell) return null
    // Reuse the footprint validation for edited maps without decorating occupancy.
    if (!getValidDecorationCell(layout, mapGrid, x, y, this.getDefaultDecorationBiome(), true)) return null
    return cell.group.tilesByOffset[`${cell.offsetX},${cell.offsetY}`] || null
  }

  invalidateDecorationLayout() {
    this.decorationLayoutCache = null
    this.decorationMapRevision++
    this.decorationLayoutPreparation.invalidate()
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

  static collectGroupTagSet(group) {
    const tagSet = new Set()
    if (!group?.tilesByOffset) return tagSet
    Object.values(group.tilesByOffset).forEach((tile) => {
      if (!Array.isArray(tile?.tags)) return
      tile.tags.forEach((tag) => {
        if (tag === 'group' || /^group_\d+$/.test(tag)) return
        tagSet.add(tag)
      })
    })
    return tagSet
  }

  filterGroupedTagCandidates(groups, options = {}) {
    if (!Array.isArray(groups) || !groups.length) return []
    const requiredAnyTags = Array.isArray(options.requiredAnyTags) ? options.requiredAnyTags.filter(Boolean) : []
    const requiredAllTags = Array.isArray(options.requiredAllTags) ? options.requiredAllTags.filter(Boolean) : []
    if (!requiredAnyTags.length && !requiredAllTags.length) return groups

    // Catalog arrays are rebuilt on every sheet/config change, so a WeakMap keyed by
    // the array invalidates itself and keeps per-tile lookups allocation-free.
    if (!this.filteredGroupCandidateCache) this.filteredGroupCandidateCache = new WeakMap()
    let perGroups = this.filteredGroupCandidateCache.get(groups)
    if (!perGroups) {
      perGroups = new Map()
      this.filteredGroupCandidateCache.set(groups, perGroups)
    }
    const cacheKey = `${requiredAnyTags.join(',')}|${requiredAllTags.join(',')}`
    const cachedGroups = perGroups.get(cacheKey)
    if (cachedGroups) return cachedGroups

    const filteredGroups = groups.filter((group) => {
      const tagSet = TextureManager.collectGroupTagSet(group)
      if (requiredAllTags.length && !requiredAllTags.every(tag => tagSet.has(tag))) return false
      if (requiredAnyTags.length && !requiredAnyTags.some(tag => tagSet.has(tag))) return false
      return true
    })
    perGroups.set(cacheKey, filteredGroups)
    return filteredGroups
  }

  selectGroupedTileVariant(tag, options = {}) {
    const width = Math.max(1, Math.floor(options.width || 1))
    const height = Math.max(1, Math.floor(options.height || 1))
    const offsetX = Math.max(0, Math.floor(options.offsetX || 0))
    const offsetY = Math.max(0, Math.floor(options.offsetY || 0))
    const includeDefaultDecals = Boolean(options.includeDefaultDecals)
    const groups = this.filterGroupedTagCandidates(
      this.getGroupedTagCandidates(tag, { includeDefaultDecals }),
      options
    ).filter(group => group.width === width && group.height === height)
    if (!groups.length) return null
    const seed = Number.isFinite(options.seed) ? options.seed : 0
    const selectedGroup = groups[Math.abs(seed) % groups.length]
    return selectedGroup.tilesByOffset[`${offsetX},${offsetY}`] || null
  }

  getIntegratedTileForMapTile(type, x, y, options = {}) {
    if (type === 'street') {
      const mapGrid = options?.mapGrid
      const selectedStreetTile = this.selectStreetTileByTags(['street'], x, y, mapGrid)
      if (!selectedStreetTile?.rect) return null
      return {
        image: selectedStreetTile.image || this.integratedSpriteSheetImage,
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

    let rotation = 0
    let selectedTags = null
    if (type === 'land' || type === 'water') {
      const tileBiome = mapGrid?.[y]?.[x]?.biome
      const requestedBiome = ['soil', 'sand', 'grass', 'snow'].includes(options?.biomeTag)
        ? options.biomeTag
        : (['soil', 'sand', 'grass', 'snow'].includes(tileBiome) ? tileBiome : this.getDefaultDecorationBiome())
      if (mapGrid && options.includeDecorations !== false) {
        // Decorations come from the precomputed layout (multi-tile first, then 1x1).
        const cell = getValidDecorationCell(this.getDecorationLayout(mapGrid), mapGrid, x, y, this.getDefaultDecorationBiome())
        if (cell && (!options?.biomeTag || cell.biome === requestedBiome)) {
          rotation = cell.rotation || 0
          if (type === 'water') selectedTags = cell.group.waterTags
          selected = cell.group.tilesByOffset[`${cell.offsetX},${cell.offsetY}`] || null
        }
      } else if (!mapGrid && type === 'land') {
        // Without a map only 1x1 sprites can be chosen.
        const hash = decorationHash(x, y, 7919)
        const singles = this.integratedDecorationPools?.[requestedBiome]?.single
        if (singles?.length && hash % SINGLE_DECORATION_INTERVAL === 0) {
          selected = singles[(hash >>> 8) % singles.length].tilesByOffset['0,0'] || null
        }
      }
      // Custom ground sheets (passable, non-decorative tiles) still cover the
      // remaining cells. The bundled sheets have none, so those cells show the
      // default organic ground.
      if (type === 'water') selected = selected || this.selectIntegratedTileByTags(['water'], x, y)
      if (type === 'land') selected = selected || this.selectIntegratedTileFromCandidates(this.integratedLandBuckets[requestedBiome]?.passable, x, y)
    } else if (type === 'rock') {
      selected = this.selectIntegratedTileByTags(['rocks'], x, y)
        || this.selectIntegratedTileByTags(['rock'], x, y)
    } else {
      selected = this.selectIntegratedTileByTags([type], x, y)
        || this.selectIntegratedTileByTags(['passable'], x, y)
    }

    if (!selected?.rect) return null

    return {
      image: selected.image || getImageTextureWithBlendMode(this.integratedSpriteSheetImage, this.integratedBlendMode, this.integratedBlackKey, this.integratedSpriteSheetMetadata),
      rect: selected.rect,
      cityOverlayOnly: selected.cityOverlayOnly,
      tags: selectedTags || selected.tags || [],
      rotation,
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

      loadPreparedImage(`${baseName}.${extensions[index]}`).then(img => {
        this.imageCache[baseName] = img
        const callbacks = this.loadingImages[baseName] || []
        delete this.loadingImages[baseName]
        for (const cb of callbacks) cb(img)
      }, () => tryLoadImage(baseName, extensions, index + 1))
    }

    tryLoadImage(baseName, extensions, 0)
  }


  // Preload all tile textures at startup.
  // The three bundled sheets take ~1492ms together on a cold load.
  async preloadAllTextures(callback, onProgress) {
    const totalWeight = 497 * 3
    let completedWeight = 0
    const report = (fraction) => {
      if (typeof onProgress === 'function') onProgress(fraction)
      reportBootTextures(fraction)
    }
    if (this.preloadPromise) {
      const result = await this.preloadPromise
      report(1)
      if (callback) callback()
      return result
    }
    this.loadingStarted = true
    this.allTexturesLoaded = false
    this.texturePreparationState = 'preparing'
    this.texturePreparationError = null
    this.texturePreparationProgress.completed = 0
    this.texturePreparationProgress.total = 3

    this.preloadPromise = (async() => {
      try {
        bootMark('tile-textures:start')
        // Water is rendered procedurally; no bitmap water frames are loaded.
        const waterFrames = []

        const reportSheet = async(promise) => {
          const result = await promise
          completedWeight += 497
          report(Math.min(1, completedWeight / totalWeight))
          this.texturePreparationProgress.completed++
          return result
        }
        await Promise.all([
          reportSheet(this.preloadDefaultCombatDecalSheet()),
          reportSheet(this.preloadDefaultCrystalSheet())
        ])

        // Publish one complete texture generation after every source decoded
        // and every finite prepared variant was built.
        this.waterFrames = waterFrames
        const decodedImages = new Set([
          this.defaultCombatDecalSheetImage,
          this.defaultCrystalSheetImage
        ].filter(Boolean))
        this.textureByteUsage = {
          decodedSourceBytes: [...decodedImages].reduce((total, image) => total + estimateDecodedImageBytes(image), 0),
          preparedRasterBytes: waterFrames.length * TILE_SIZE * TILE_SIZE * 4,
          transferBytes: 0,
          gpuStagingBytes: 0
        }
        this.allTexturesLoaded = true
        this.texturePreparationState = 'ready'
        bootMark('tile-textures:end')
        return this
      } catch (error) {
        this.loadingStarted = true
        this.texturePreparationState = 'degraded'
        this.allTexturesLoaded = true
        this.texturePreparationError = error
        window.logger?.warn?.('Terrain textures unavailable; using terrain fallback', error)
        return this
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
      { key: 'crystals', image: this.defaultCrystalSheetImage, animated: false }
    ].filter(asset => asset.image || asset.frames?.length)
  }

  retryPreloadAllTextures(callback) {
    if (!['failed', 'degraded'].includes(this.texturePreparationState)) return this.preloadPromise || Promise.resolve(this)
    this.preloadPromise = null
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
