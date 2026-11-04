import { describe, expect, it, vi } from 'vitest'
import { CheckpointMapMirror } from '../../src/storage/checkpointMapMirror.js'
import { CheckpointEncoder } from '../../src/storage/checkpointEncoder.js'
import { encodeCompactSave, encodeCompactSaveCooperatively, decodeSaveObject } from '../../src/saveFormat.js'
import { RenderRevisionStore, RENDER_REVISION_DOMAINS } from '../../src/rendering/prepared/renderRevisionStore.js'

const gridOf = () => Array.from({ length: 2 }, () => Array.from({ length: 32 }, () => ({ type: 'land', ore: false })))
const serializeTile = tile => ({ ...tile, ...(tile.cityBuilding ? { cityBuilding: { ...tile.cityBuilding } } : {}) })

describe('incremental checkpoint snapshots', () => {
  it('[U07058] recaptures a chunk changed during preparation before taking the dynamic snapshot', async() => {
    const grid = gridOf(), store = new RenderRevisionStore({ width: 32, height: 2 })
    const patches = []
    let time = 0, changed = false
    const mirror = new CheckpointMapMirror({ serializeTile, onChunk: patch => patches.push(patch),
      clock: () => ++time, budgetMs: 1, yieldTask: async() => {
        if (changed) return
        changed = true
        grid[0][0].ore = true
        store.invalidate(RENDER_REVISION_DOMAINS.RESOURCE, { left: 0, top: 0, right: 1, bottom: 1 })
      } })
    const snapshot = await mirror.synchronizeAndCapture(grid, () => store, () => mirror.snapshotRows())
    expect(snapshot[0][0].ore).toBe(true)
    expect(patches.filter(patch => patch.x === 0)).toHaveLength(2)
    const original = snapshot[0][0]
    grid[0][0].ore = false
    store.invalidate(RENDER_REVISION_DOMAINS.RESOURCE, { left: 0, top: 0, right: 1, bottom: 1 })
    await mirror.synchronize(grid, () => store)
    expect(snapshot[0][0]).toBe(original)
    expect(snapshot[0][0].ore).toBe(true)
  })

  it('[U07059] sends no unchanged map chunks and still captures city HP without a terrain revision', async() => {
    const grid = gridOf(), store = new RenderRevisionStore({ width: 32, height: 2 })
    grid[0][0].cityBuilding = { id: 'city', health: 100, maxHealth: 100 }
    const patch = vi.fn(), mirror = new CheckpointMapMirror({ serializeTile, onChunk: patch })
    await mirror.synchronize(grid, () => store)
    patch.mockClear()
    await mirror.synchronize(grid, () => store)
    expect(patch).not.toHaveBeenCalled()
    grid[0][0].cityBuilding.health = 90
    await mirror.synchronize(grid, () => store)
    expect(patch).toHaveBeenCalledOnce()
    expect(patch.mock.calls[0][0].rows[0][0].cityBuilding.health).toBe(90)
  })

  it('[U07060] cancels an in-progress snapshot when its map is replaced', async() => {
    const grid = gridOf(), store = new RenderRevisionStore({ width: 32, height: 2 })
    const capture = vi.fn()
    const mirror = new CheckpointMapMirror({ serializeTile, budgetMs: 0, yieldTask: async() => mirror.reset() })
    await expect(mirror.synchronizeAndCapture(grid, () => store, capture)).rejects.toMatchObject({ name: 'AbortError' })
    expect(capture).not.toHaveBeenCalled()
  })

  it('[U07061] preserves the exact compact format while yielding during worker-less encoding', async() => {
    const map = Array.from({ length: 20 }, (_, y) => Array.from({ length: 32 }, (_, x) => ({
      type: x % 3 ? 'land' : 'water', ore: y % 3 === 0, biomeBlend: { biome: 'sand', alpha: x / 32 },
      cityBuilding: x === 0 ? { health: 100 } : undefined
    })))
    const save = { label: 'consistent|checkpoint', time: 100, state: {
      gameState: { money: 123, gameTime: 5 }, units: [{ id: 'u1', type: 'tank', path: [{ x: 1, y: 2 }] }],
      mapTileState: map, mapGridTypes: map.map(row => row.map(tile => tile.type)), orePositions: []
    } }
    const yieldTask = vi.fn(async() => {})
    let clock = 0
    const encoded = await encodeCompactSaveCooperatively(save, { yieldTask, clock: () => ++clock, budgetMs: 1 })
    expect(yieldTask.mock.calls.length).toBeGreaterThan(2)
    expect(encoded).toBe(encodeCompactSave(save))
    expect(JSON.parse(decodeSaveObject(encoded).state).units[0].path).toEqual([{ x: 1, y: 2 }])
  })

  it('[U07062] falls back after worker failure using the captured immutable map and dynamic state', async() => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn() }
    const encoder = new CheckpointEncoder({ workerFactory: () => worker })
    const tile = { type: 'land', ore: true }
    const save = { label: 'lastGame', time: 1, state: { gameState: { money: 123 }, units: [] } }
    const encoded = encoder.encode(save, 1, { snapshotRows: () => [[tile]] }, {})
    worker.onerror()
    expect(JSON.parse(decodeSaveObject(await encoded).state)).toMatchObject({ gameState: { money: 123 }, mapTileState: [[{ ore: true }]] })
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('[U07065] rejects a stale worker generation instead of publishing or encoding another snapshot', async() => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn() }
    const encoder = new CheckpointEncoder({ workerFactory: () => worker })
    const snapshotRows = vi.fn()
    const pending = encoder.encode({ state: {} }, 2, { snapshotRows }, {})
    worker.onmessage({ data: { id: 1, generation: 1, encoded: 'stale' } })
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(snapshotRows).not.toHaveBeenCalled()
    encoder.dispose()
  })

  it('[U07066] uses the immutable snapshot if posting an incremental map patch fails', async() => {
    const worker = { postMessage: vi.fn(() => { throw new Error('worker closed') }), terminate: vi.fn() }
    const encoder = new CheckpointEncoder({ workerFactory: () => worker })
    encoder.send({ type: 'reset', width: 1, height: 1, generation: 1 })
    const encoded = await encoder.encode({ label: 'lastGame', time: 1, state: { gameState: { money: 456 } } }, 1,
      { snapshotRows: () => [[{ type: 'water' }]] }, {})
    expect(JSON.parse(decodeSaveObject(encoded).state)).toMatchObject({ gameState: { money: 456 }, mapTileState: [[{ type: 'water' }]] })
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
})
