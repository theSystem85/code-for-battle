// Preparation-only CPU/heap probe. This does not measure presented FPS.
import { performance } from 'node:perf_hooks'
import { buildDecorationLayout, buildDecorationPools } from '../src/rendering/decorationLayout.js'

const categories = ['trees', 'rocks', 'farm', 'roadside', 'landmark', 'ground_detail', 'other', 'city', 'ruins']
const groups = categories.map((category, index) => {
  const span = category === 'landmark' ? 3 : category === 'city' ? 2 : 1
  const tilesByOffset = {}
  for (let y = 0; y < span; y++) for (let x = 0; x < span; x++) {
    tilesByOffset[`${x},${y}`] = { sheetPath: 'benchmark.webp', rect: { x: x * 64, y: y * 64, width: 64, height: 64 } }
  }
  return { groupLabel: `group_${index}`, width: span, height: span, tilesByOffset, tagSet: new Set(['grass', 'decorative', category]) }
})
const legacyPools = buildDecorationPools(groups.filter(group => !group.tagSet.has('ground_detail')).map(group => ({ ...group, tagSet: new Set(['grass', 'decorative']) })))
const naturalPools = buildDecorationPools(groups)
for (const size of [128, 256]) {
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => ({ type: 'land', biome: 'grass' })))
  for (const [mode, pools] of [['legacy', legacyPools], ['natural', naturalPools], ['city-max', naturalPools]]) {
    const durations = []
    let firstMs = 0
    let layout
    const beforeHeap = process.memoryUsage().heapUsed
    for (let sample = 0; sample < 5; sample++) {
      const start = performance.now()
      layout = buildDecorationLayout(grid, pools, { salt: 688, ...(mode === 'city-max' ? { citySeeds: 8, cityClusterSize: 20, ruinSeeds: 10, ruinClusterSize: 20 } : {}) })
      const elapsed = performance.now() - start
      if (sample === 0) firstMs = elapsed
      durations.push(elapsed)
    }
    durations.sort((a, b) => a - b)
    console.log(JSON.stringify({ mode, size, samples: durations.length, firstMs, medianMs: durations[2], maxMs: durations[4],
      heapDeltaBytes: process.memoryUsage().heapUsed - beforeHeap,
      cityBuildings: layout.cells.filter(cell => cell?.offsetX === 0 && cell?.offsetY === 0 && cell.group.tagSet.has('city')).length,
      decoratedCells: layout.cells.filter(Boolean).length, detailCells: layout.groundDetails?.filter(Boolean).length || 0 }))
  }
}
