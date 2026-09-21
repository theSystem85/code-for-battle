import { afterEach, describe, expect, it, vi } from 'vitest'
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
    const canvas = { width: 300, height: 150 }
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

describe('MapRenderer revisioned terrain cache', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('performs no signature scan or topology reconstruction on an unchanged frame', () => {
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

  it('invalidates only the surface two-tile halo without rebuilding topology', () => {
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

  it('keeps local topology SOT updates equal to the full-rebuild oracle after randomized edits', () => {
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

  it('matches full-rebuild raster commands and resident bytes after a topology mutation', () => {
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
})
