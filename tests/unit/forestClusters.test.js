import { describe, expect, it } from 'vitest'
import { buildDecorationConstraints, buildDecorationLayout, buildDecorationPools, buildForestClusters, decorationFootprintDistance, decorationSpacingAllows } from '../../src/rendering/decorationLayout.js'

const grid = () => Array.from({ length: 96 }, () => Array.from({ length: 96 }, () => ({ type: 'land', biome: 'grass' })))
function trees(width = 1, height = width) {
  return Array.from({ length: 12 }, (_, index) => ({ width, height, groupLabel: `tree-${index}`,
    tagSet: new Set(['grass', 'decorative', 'trees', 'impassable']),
    tilesByOffset: Object.fromEntries(Array.from({ length: width * height }, (_, offset) => [
      `${offset % width},${Math.floor(offset / width)}`, { sheetPath: 'trees.webp', rect: { x: index * 64, y: 0, width: 64, height: 64 } }
    ])) }))
}
const anchors = layout => layout.cells.filter(cell => cell && cell.offsetX === 0 && cell.offsetY === 0)

describe('natural forest preparation', () => {
  it('[U05439] grows reproducible lobed forest fields with variable cores, edges and clearings', () => {
    const map = grid()
    const forest = buildForestClusters(map, { salt: 688 })
    expect(buildForestClusters(map, { salt: 688 })).toEqual(forest)
    expect(buildForestClusters(map, { salt: 689 }).density).not.toEqual(forest.density)
    expect(forest.centers.length).toBeGreaterThanOrEqual(4)
    const values = [...forest.density]
    expect(values.filter(value => value > 0.4).length).toBeGreaterThan(100)
    expect(values.filter(value => value > 0 && value < 0.1).length).toBeGreaterThan(100)
    expect(values.filter(value => value === 0).length).toBeGreaterThan(4000)
    let beyondCircularCenters = 0
    values.forEach((value, offset) => {
      if (value > 0 && forest.centers.every(center => Math.hypot(center.x - offset % 96, center.y - Math.floor(offset / 96)) > forest.radius)) beyondCircularCenters++
    })
    expect(beyondCircularCenters).toBeGreaterThan(30)
  })

  it.each([1, 2, 3, 688])('[U05440] places denser forests and a few genuinely isolated trees for seed %s', seed => {
    const map = grid()
    const pools = buildDecorationPools(trees())
    const layout = buildDecorationLayout(map, pools, { salt: seed })
    const placed = anchors(layout)
    const forest = buildForestClusters(map, { salt: seed })
    const clustered = placed.filter(tree => forest.density[tree.anchorY * 96 + tree.anchorX] > 0)
    // The previous circular/noise scatter placed 27–116 trees on these same
    // fixtures. Require substantially denser woods for every representative seed.
    expect(placed.length).toBeGreaterThan(200)
    expect(clustered.length / placed.length).toBeGreaterThan(0.85)
    const isolated = placed.filter(tree => !forest.density[tree.anchorY * 96 + tree.anchorX] &&
      placed.every(other => other === tree || decorationFootprintDistance(tree, other) >= 4))
    expect(isolated.length).toBeGreaterThan(0)
    expect(isolated.length).toBeLessThan(placed.length / 10)
    expect(buildDecorationLayout(map, pools, { salt: seed }).cells).toEqual(layout.cells)
    placed.forEach((tree, index) => expect(decorationSpacingAllows(tree, placed.slice(index + 1))).toBe(true))
  })

  it('[U05441] keeps full-size forest footprints away from water, roads, resources and bases on mixed maps', () => {
    const map = grid()
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      if (x > 65) map[y][x].biome = 'snow'
      if (x === 35) map[y][x].type = 'street'
      if (y === 15) map[y][x].type = 'water'
    }
    map[45][45].ore = true
    map[75][75].basePosition = true
    const starts = [{ x: 12, y: 70 }]
    const constraints = buildDecorationConstraints(map, starts)
    const layout = buildDecorationLayout(map, buildDecorationPools([...trees(), ...trees(2, 3)]), { salt: 688, startPositions: starts })
    const placed = anchors(layout)
    expect(placed.some(tree => tree.group.height === 3)).toBe(true)
    expect(placed.length).toBeGreaterThan(50)
    layout.cells.forEach((cell, offset) => {
      if (!cell) return
      const tile = map[Math.floor(offset / 96)][offset % 96]
      expect(tile.type).toBe('land')
      expect(tile.biome).toBe('grass')
      expect(constraints.keepClear[offset]).toBe(0)
      expect(constraints.roadDistance[offset]).toBeGreaterThan(1)
    })
  })
})
