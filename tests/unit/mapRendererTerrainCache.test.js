import { afterEach, describe, expect, it, vi } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
import { createTerrainByteBudget, getTerrainRasterBytes } from '../../src/rendering/prepared/terrainCacheState.js'
import { MapRenderer } from '../../src/rendering/mapRenderer.js'
import { RENDER_REVISION_DOMAINS } from '../../src/rendering/prepared/renderRevisionStore.js'

function makeTextureManager() {
  return {
    integratedSpriteSheetMode: false,
    integratedRenderSignature: 'terrain-test',
    allTexturesLoaded: false,
    tileTextureCache: { land: [], street: [], water: [] },
    waterFrames: [],
    waterFrameIndex: 0,
    getCurrentWaterFrame: () => null,
    getTileVariation: () => 0,
    getIntegratedTileForMapTile: () => null,
    getDecalTileCandidatesByTags: () => []
  }
}

function makeMap(width, height, type = 'land') {
  return Array.from(
    { length: height },
    () => Array.from({ length: width }, () => ({ type, biome: 'grass' }))
  )
}

function makeOutputContext() {
  return {
    drawImage: vi.fn(),
    imageSmoothingEnabled: true
  }
}

function makeTraceContext(canvas) {
  const operations = []
  return {
    canvas,
    operations,
    fillStyle: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    clearRect() {
      operations.length = 0
    },
    fillRect(...args) {
      operations.push(['fillRect', this.fillStyle, ...args])
    },
    drawImage(...args) {
      operations.push(['drawImage', ...args.slice(1)])
    },
    save() {
      operations.push(['save'])
    },
    restore() {
      operations.push(['restore'])
    },
    beginPath() {
      operations.push(['beginPath'])
    },
    closePath() {
      operations.push(['closePath'])
    },
    moveTo(...args) {
      operations.push(['moveTo', ...args])
    },
    lineTo(...args) {
      operations.push(['lineTo', ...args])
    },
    clip() {
      operations.push(['clip'])
    },
    fill() {
      operations.push(['fill', this.fillStyle])
    }
  }
}

function installTraceCanvases() {
  const originalCreateElement = document.createElement.bind(document)
  return vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
    if (String(tagName).toLowerCase() !== 'canvas') return originalCreateElement(tagName, options)
    const events = new globalThis.EventTarget()
    const canvas = {
      width: 300,
      height: 150,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events)
    }
    const context = makeTraceContext(canvas)
    canvas.getContext = () => context
    return canvas
  })
}

function snapshotChunks(renderer) {
  return [...renderer.chunkCache.entries()]
    .map(([key, chunk]) => ({
      key,
      width: chunk.canvas.width,
      height: chunk.canvas.height,
      residentBytes: chunk.residentBytes,
      containsWater: chunk.containsWater,
      containsAnimatedWaterSot: chunk.containsAnimatedWaterSot,
      operations: chunk.ctx.operations
    }))
    .sort((left, right) => left.key.localeCompare(right.key))
}

describe('prepared terrain residency', () => {
  afterEach(() => vi.restoreAllMocks())

  function readyRenderer() {
    installTraceCanvases()
    const renderer = new MapRenderer(makeTextureManager())
    renderer.textureManager.allTexturesLoaded = true
    vi.spyOn(renderer, 'useOrganicTerrain').mockReturnValue(true)
    vi.spyOn(renderer.crystalGlowRenderer, 'getSprite').mockReturnValue(null)
    vi.spyOn(renderer.crystalGlowRenderer, 'getSparkle').mockReturnValue(null)
    vi.spyOn(renderer, 'drawResourceOverlays').mockImplementation(() => {})
    vi.spyOn(renderer, 'drawBaseLayer').mockImplementation(ctx => ctx.fillRect(0, 0, 16 * TILE_SIZE, 16 * TILE_SIZE))
    return renderer
  }

  it('[U07063] retains prepared ground across overlay eviction, camera jumps and resource edits', async() => {
    const renderer = readyRenderer(), grid = makeMap(32, 32)
    const budget = createTerrainByteBudget({ residentBytes: 16 * 1024 * 1024, stagingBytes: 2 * 1024 * 1024 })
    const pages = await renderer.prepareStaticTerrain(grid, { budget, yieldTask: async() => {} })
    renderer.publishStaticTerrain(pages)
    expect(pages.pages.size).toBe(4)
    expect(renderer.drawBaseLayer).toHaveBeenCalledTimes(4)
    renderer.maxCachedChunks = 1
    for (const x of [0, 16, 0]) renderer.renderTiles(makeOutputContext(), grid, { x: x * TILE_SIZE, y: 0 }, x, 0, x + 16, 16, {}, { skipWaterBase: true, skipWaterSot: true })
    expect(renderer.drawBaseLayer).toHaveBeenCalledTimes(4)
    expect(pages.pages.get('0,0').everRendered).toBe(true)
    grid[0][0].ore = true
    renderer.terrainRevisions.invalidate(grid, RENDER_REVISION_DOMAINS.RESOURCE, { left: 0, top: 0, right: 1, bottom: 1 })
    renderer.renderTiles(makeOutputContext(), grid, { x: 0, y: 0 }, 0, 0, 16, 16, {}, { skipWaterBase: true, skipWaterSot: true })
    expect(renderer.drawResourceOverlays).toHaveBeenCalled()
    expect(renderer.drawBaseLayer).toHaveBeenCalledTimes(4)
    renderer.terrainRevisions.invalidate(grid, RENDER_REVISION_DOMAINS.TOPOLOGY, { left: 0, top: 0, right: 1, bottom: 1 }, undefined, 0)
    renderer.renderTiles(makeOutputContext(), grid, { x: 0, y: 0 }, 0, 0, 16, 16, {}, { skipWaterBase: true, skipWaterSot: true })
    expect(renderer.drawBaseLayer).toHaveBeenCalledTimes(5)
    renderer.invalidateAllChunks()
    expect(budget.usage.terrainResident).toBe(0)
    expect(budget.usage.terrainStaging).toBe(0)
  })

  it('[U07069] transfers an offscreen raster and its reservation without resizing or stealing a visible page', () => {
    installTraceCanvases()
    const renderer = new MapRenderer(makeTextureManager()), grid = makeMap(64, 16)
    renderer.maxCachedChunks = 2
    renderer.terrainByteBudget = createTerrainByteBudget({ residentBytes: 3 * 517 * 517 * 4, stagingBytes: 517 * 517 * 4 })
    const first = renderer.getOrCreateChunk(0, 0, 0, 0, 16, 16)
    renderer.updateChunkCache(first, grid, false, null)
    const visible = renderer.getOrCreateChunk(1, 0, 16, 0, 32, 16)
    renderer.updateChunkCache(visible, grid, false, null)
    renderer.activeChunkKeys.add(visible.key)
    const canvas = first.canvas, bytes = renderer.terrainByteBudget.usage.terrainResident
    const next = renderer.getOrCreateChunk(2, 0, 32, 0, 48, 16)
    expect(next.canvas).toBe(canvas)
    expect(next.canvas.width).toBe(517)
    expect(renderer.chunkCache.has(visible.key)).toBe(true)
    expect(renderer.chunkCanvasStats.reused).toBe(1)
    expect(renderer.terrainByteBudget.usage.terrainResident).toBe(bytes)
    next.canvas.dispatchEvent(new Event('contextlost'))
    expect(next.contextLost).toBe(true)
    expect(first.contextLost).toBe(false)
    renderer.invalidateAllChunks()
    expect(renderer.terrainByteBudget.usage.terrainResident).toBe(0)
  })

  it('[U07064] rejects an oversized raster generation before baking and releases cancelled preparation', async() => {
    const renderer = readyRenderer()
    const budget = createTerrainByteBudget({ residentBytes: 16 * 1024 * 1024, stagingBytes: 2 * 1024 * 1024 })
    expect(await renderer.prepareStaticTerrain(makeMap(256, 256), { budget })).toBeNull()
    expect(renderer.drawBaseLayer).not.toHaveBeenCalled()
    const controller = new AbortController()
    await expect(renderer.prepareStaticTerrain(makeMap(32, 32), {
      budget, signal: controller.signal, yieldTask: async() => controller.abort()
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(budget.usage.terrainResident).toBe(0)
    expect(budget.usage.terrainStaging).toBe(0)
    expect(renderer.preparedPages).toBeNull()
  })
})

describe('MapRenderer revisioned terrain cache', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[U02659] performs no signature scan or topology reconstruction on an unchanged frame', () => {
    const renderer = new MapRenderer(makeTextureManager())
    const mapGrid = makeMap(32, 32)
    const signature = vi.spyOn(renderer, 'computeChunkSignature')

    renderer.renderTiles(makeOutputContext(), mapGrid, { x: 0, y: 0 }, 0, 0, 32, 32, {}, {})
    renderer.resetFrameChunkStats()
    renderer.renderTiles(makeOutputContext(), mapGrid, { x: 0, y: 0 }, 0, 0, 32, 32, {}, {})

    expect(signature).not.toHaveBeenCalled()
    expect(renderer.frameChunkStats.chunkSignatureCalls).toBe(0)
    expect(renderer.frameChunkStats.topologyReconstructions).toBe(0)
    expect(renderer.frameChunkStats.chunkRedraws).toBe(0)
    expect(renderer.frameChunkStats.chunkHits).toBe(4)
  })

  it('[U02660] invalidates only the surface two-tile halo without rebuilding topology', () => {
    const renderer = new MapRenderer(makeTextureManager())
    const mapGrid = makeMap(64, 64)
    renderer.renderTiles(makeOutputContext(), mapGrid, { x: 0, y: 0 }, 0, 0, 64, 64, {}, {})

    mapGrid[31][31].biome = 'sand'
    const bounds = { left: 31, top: 31, right: 32, bottom: 32 }
    renderer.notifyTerrainMutation(mapGrid, RENDER_REVISION_DOMAINS.SURFACE, bounds, bounds)
    renderer.resetFrameChunkStats()
    renderer.renderTiles(makeOutputContext(), mapGrid, { x: 0, y: 0 }, 0, 0, 64, 64, {}, {})

    expect(renderer.frameChunkStats.chunkRedraws).toBe(4)
    expect(renderer.frameChunkStats.chunkHits).toBe(12)
    expect(renderer.frameChunkStats.topologyReconstructions).toBe(0)
  })

  it('[U02661] keeps local topology SOT updates equal to the full-rebuild oracle after randomized edits', () => {
    const mapGrid = makeMap(16, 16)
    for (let y = 0; y < mapGrid.length; y++) {
      for (let x = 0; x < mapGrid[y].length; x++) {
        if ((x * 7 + y * 11) % 9 === 0) mapGrid[y][x].type = 'water'
        else if ((x * 5 + y * 3) % 13 === 0) mapGrid[y][x].type = 'street'
      }
    }
    const incremental = new MapRenderer(makeTextureManager())
    const oracle = new MapRenderer(makeTextureManager())
    incremental.computeSOTMask(mapGrid)

    let randomState = 0x12345678
    const nextRandom = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0
      return randomState
    }
    const types = ['land', 'street', 'water']

    for (let edit = 0; edit < 40; edit++) {
      const x = 5 + (nextRandom() % 6)
      const y = 5 + (nextRandom() % 6)
      mapGrid[y][x].type = types[nextRandom() % types.length]
      const bounds = { left: x, top: y, right: x + 1, bottom: y + 1 }
      incremental.notifyTerrainMutation(
        mapGrid,
        RENDER_REVISION_DOMAINS.TOPOLOGY,
        bounds,
        bounds
      )
      oracle.computeSOTMask(mapGrid)
      expect(incremental.sotMask).toEqual(oracle.sotMask)
    }
  })

  it('[U02662] matches full-rebuild raster commands and resident bytes after a topology mutation', () => {
    installTraceCanvases()
    const mapGrid = makeMap(32, 32)
    const incremental = new MapRenderer(makeTextureManager())
    incremental.renderTiles(makeOutputContext(), mapGrid, { x: 0, y: 0 }, 0, 0, 32, 32, {}, {})

    mapGrid[15][15].type = 'street'
    mapGrid[15][16].type = 'street'
    mapGrid[16][15].type = 'street'
    const oldBounds = { left: 15, top: 15, right: 16, bottom: 16 }
    const newBounds = { left: 15, top: 15, right: 17, bottom: 17 }
    incremental.notifyTerrainMutation(
      mapGrid,
      RENDER_REVISION_DOMAINS.TOPOLOGY,
      oldBounds,
      newBounds
    )
    incremental.renderTiles(makeOutputContext(), mapGrid, { x: 0, y: 0 }, 0, 0, 32, 32, {}, {})

    const fullRebuild = new MapRenderer(makeTextureManager())
    fullRebuild.renderTiles(makeOutputContext(), mapGrid, { x: 0, y: 0 }, 0, 0, 32, 32, {}, {})

    expect(snapshotChunks(incremental)).toEqual(snapshotChunks(fullRebuild))
    expect(incremental.terrainByteBudget.getUsage()).toEqual(
      fullRebuild.terrainByteBudget.getUsage()
    )
  })

  it('[U06500] keeps every decorative page stable when an unrelated building sprite tier publishes', () => {
    const renderer = new MapRenderer(makeTextureManager())
    const mapGrid = makeMap(64, 64)
    renderer.renderTiles(makeOutputContext(), mapGrid, { x: 0, y: 0 }, 0, 0, 64, 64, {}, {})
    const before = [...renderer.chunkCache.values()].map(chunk => {
      chunk.decorativeCanvas = { id: chunk.key }
      chunk.decorativeReadyAt = 1234
      chunk.decorativeKey = renderer.getDecorativeKey(chunk)
      return {
        chunk,
        key: chunk.decorativeKey,
        canvas: chunk.decorativeCanvas,
        readyAt: chunk.decorativeReadyAt
      }
    })

    expect(renderer.notifySpriteTierPublication({
      spriteId: '/images/map/buildings/construction-yard.webp',
      tier: 1,
      revision: 1
    })).toBe(0)

    for (const snapshot of before) {
      expect(renderer.getDecorativeKey(snapshot.chunk)).toBe(snapshot.key)
      expect(snapshot.chunk.decorativeCanvas).toBe(snapshot.canvas)
      expect(snapshot.chunk.decorativeReadyAt).toBe(snapshot.readyAt)
    }
  })

  it('[U06501] invalidates only decorative pages that used the published sprite sheet', () => {
    const renderer = new MapRenderer(makeTextureManager())
    const mapGrid = makeMap(64, 64)
    renderer.renderTiles(makeOutputContext(), mapGrid, { x: 0, y: 0 }, 0, 0, 64, 64, {}, {})
    const affected = renderer.chunkCache.get('0,0')
    const unaffected = renderer.chunkCache.get('1,0')
    renderer.decorativePageDependencies.replacePage(affected.key, ['/images/map/decorations/props.webp'])

    expect(renderer.notifySpriteTierPublication({
      spriteId: '/images/map/decorations/props.webp',
      tier: 1,
      revision: 1
    })).toBe(1)

    const affectedRevision = {}
    const unaffectedRevision = {}
    renderer.terrainRevisions.getChunkRevisions(affected.chunkX, affected.chunkY, affectedRevision)
    renderer.terrainRevisions.getChunkRevisions(unaffected.chunkX, unaffected.chunkY, unaffectedRevision)
    expect(affectedRevision.asset).toBe(0)
    expect(affected.decorativeAssetRevision).toBe(1)
    expect(unaffected.decorativeAssetRevision || 0).toBe(0)
    expect(unaffectedRevision.asset).toBe(0)
  })

  it('[U06502] preserves the original fade timestamp when replacing a published decorative page', () => {
    installTraceCanvases()
    const textureManager = makeTextureManager()
    textureManager.integratedSpriteSheetMode = true
    const renderer = new MapRenderer(textureManager)
    const mapGrid = makeMap(1, 1)
    renderer.terrainRevisions.ensureMap(mapGrid)
    const chunk = renderer.getOrCreateChunk(0, 0, 0, 0, 1, 1)
    chunk.decorativeCanvas = { id: 'published' }
    chunk.decorativeReadyAt = 1234
    vi.spyOn(renderer, 'drawDecorativeLayer').mockImplementation(() => {})
    renderer.decorativeWarmQueue.set(chunk.key, {
      chunk,
      mapGrid,
      useTexture: true,
      key: renderer.getDecorativeKey(chunk)
    })

    expect(renderer.processDecorativeWarmQueue({ timeRemaining: () => 10 })).toBe(true)
    expect(chunk.decorativeCanvas).not.toEqual({ id: 'published' })
    expect(chunk.decorativeReadyAt).toBe(1234)
  })

  it('[U07003] rebuilds a previously loaded terrain page after its context is restored', () => {
    installTraceCanvases()
    const renderer = new MapRenderer(makeTextureManager())
    const mapGrid = makeMap(16, 16)
    const render = () => renderer.renderTiles(makeOutputContext(), mapGrid, { x: 0, y: 0 }, 0, 0, 16, 16, {}, {})
    render()
    const chunk = renderer.chunkCache.get('0,0')
    const originalRaster = [...chunk.ctx.operations]
    chunk.ctx.operations.length = 0
    chunk.canvas.dispatchEvent(new Event('contextlost'))
    expect(chunk.contextLost).toBe(true)
    expect(chunk.everRendered).toBe(false)
    chunk.canvas.dispatchEvent(new Event('contextrestored'))
    renderer.resetFrameChunkStats()
    render()

    expect(chunk.contextLost).toBe(false)
    expect(chunk.ctx.operations).toEqual(originalRaster)
    expect(chunk.everRendered).toBe(true)
    expect(renderer.frameChunkStats.chunkMisses).toBe(1)
    expect(renderer.frameChunkStats.chunkHits).toBe(0)
  })

  it.each(['event', 'poll'])('[U07004] draws full terrain directly while a cached context is lost (%s)', (lossSignal) => {
    installTraceCanvases()
    const renderer = new MapRenderer(makeTextureManager())
    const mapGrid = makeMap(16, 16)
    const output = makeOutputContext()
    renderer.renderTiles(output, mapGrid, { x: 0, y: 0 }, 0, 0, 16, 16, {}, {})
    const chunk = renderer.chunkCache.get('0,0')
    if (lossSignal === 'event') chunk.canvas.dispatchEvent(new Event('contextlost'))
    else chunk.ctx.isContextLost = () => true
    const drawBase = vi.spyOn(renderer, 'drawBaseLayer').mockImplementation(() => {})
    output.drawImage.mockClear()
    renderer.renderTiles(output, mapGrid, { x: 0, y: 0 }, 0, 0, 16, 16, {}, {})

    expect(output.drawImage).not.toHaveBeenCalled()
    expect(drawBase).toHaveBeenCalledWith(output, mapGrid, 0, 0, 16, 16, 0, 0, false, null, renderer.chunkOptions)
    expect(chunk.everRendered).toBe(false)
    expect(renderer.updateChunkCache(chunk, mapGrid, false, null)).toBe(false)
    chunk.ctx.isContextLost = () => false
    chunk.canvas.dispatchEvent(new Event('contextrestored'))
    drawBase.mockRestore()
    renderer.renderTiles(output, mapGrid, { x: 0, y: 0 }, 0, 0, 16, 16, {}, {})
    expect(chunk.everRendered).toBe(true)
    expect(output.drawImage).toHaveBeenCalled()
  })

  it('[U07005] pins cached pages ahead of the camera before allocating newly visible terrain', () => {
    installTraceCanvases()
    const renderer = new MapRenderer(makeTextureManager())
    const mapGrid = makeMap(48, 16)
    const render = (start, end) => renderer.renderTiles(makeOutputContext(), mapGrid, { x: start * TILE_SIZE, y: 0 }, start, 0, end, 16, {}, {})
    const bytes = getTerrainRasterBytes(renderer.chunkSize * TILE_SIZE + renderer.chunkPadding * 2 + 1, renderer.chunkSize * TILE_SIZE + renderer.chunkPadding * 2 + 1)
    renderer.terrainByteBudget = createTerrainByteBudget({ residentBytes: bytes * 2, stagingBytes: bytes })
    render(16, 48)
    const visibleAhead = renderer.chunkCache.get('1,0')
    const offscreen = renderer.chunkCache.get('2,0')
    renderer.maxCachedChunks = 2
    render(0, 32)

    expect(renderer.chunkCache.get('1,0')).toBe(visibleAhead)
    expect(visibleAhead.everRendered).toBe(true)
    expect(renderer.chunkCache.has(offscreen.key)).toBe(false)
    expect(offscreen.everRendered).toBe(false)
    expect(renderer.chunkCache.get('0,0').everRendered).toBe(true)
  })

})


describe('terrain staging contention', () => {
  afterEach(() => vi.restoreAllMocks())

  it('[U07037] preempts a partially prepared decoration page when a cold terrain chunk needs staging', () => {
    installTraceCanvases()
    const renderer = new MapRenderer(makeTextureManager())
    const map = makeMap(48, 16)
    renderer.renderTiles(makeOutputContext(), map, { x: 0, y: 0 }, 0, 0, 16, 16, {})
    const chunk = renderer.chunkCache.get('0,0')
    vi.spyOn(renderer, 'drawDecorativeLayer').mockImplementation(() => {})
    renderer.decorativeWarmQueue.set(chunk.key, { chunk, mapGrid: map, useTexture: false, key: renderer.getDecorativeKey(chunk) })
    const remaining = [10, 0]
    renderer.processDecorativeWarmQueue({ timeRemaining: () => remaining.shift() || 0 })
    expect(renderer.terrainByteBudget.usage.terrainStaging).toBeGreaterThan(0)
    renderer.resetFrameChunkStats()
    expect(() => renderer.renderTiles(makeOutputContext(), map, { x: 0, y: 0 }, 0, 0, 32, 16, {})).not.toThrow()
    expect(renderer.chunkCache.get('1,0').everRendered).toBe(true)
    expect(renderer.frameChunkStats.chunkFallbacks).toBe(0)
    expect(renderer.terrainByteBudget.usage.terrainStaging).toBe(0)
  })


  it('[U07041] keeps published decoration bytes resident while a replacement is staged and cancelled', () => {
    installTraceCanvases()
    const renderer = new MapRenderer(makeTextureManager())
    const map = makeMap(16, 16)
    renderer.terrainRevisions.ensureMap(map)
    const chunk = renderer.getOrCreateChunk(0, 0, 0, 0, 16, 16)
    const bytes = getTerrainRasterBytes(517, 517)
    renderer.reserveResidentRaster(chunk, bytes, true)
    chunk.decorativeCanvas = document.createElement('canvas')
    chunk.decorativeCanvas.width = chunk.decorativeCanvas.height = 517
    const published = chunk.decorativeCanvas
    const token = chunk.decorativeResidentToken
    vi.spyOn(renderer, 'drawDecorativeLayer').mockImplementation(() => {})
    const entry = { chunk, mapGrid: map, useTexture: false, key: renderer.getDecorativeKey(chunk) }
    renderer.decorativeWarmQueue.set(chunk.key, entry)
    const remaining = [10, 0]
    renderer.processDecorativeWarmQueue({ timeRemaining: () => remaining.shift() || 0 })
    expect(renderer.terrainByteBudget.usage.terrainResident).toBe(bytes)
    expect(renderer.terrainByteBudget.usage.terrainStaging).toBe(bytes)
    expect(chunk.decorativeResidentToken).toBe(token)
    const staged = entry.canvas
    renderer.discardDecorativePreparation(entry)
    expect(staged.width).toBe(1)
    expect(chunk.decorativeCanvas).toBe(published)
    expect(published.width).toBe(517)
    expect(renderer.terrainByteBudget.usage.terrainResident).toBe(bytes)
    expect(renderer.terrainByteBudget.usage.terrainStaging).toBe(0)
  })
})
