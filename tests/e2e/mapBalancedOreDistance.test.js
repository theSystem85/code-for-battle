import { test, expect } from '@playwright/test'

test.describe('Map generation ore layout balance', () => {
  test('creates equal near-base seed distances, central large fields, and seed-driven spread fields', async({ page }) => {
    const seedsToCheck = ['11', '23', '77']
    const randomSpreadSignatures = []

    for (const seed of seedsToCheck) {
      await page.goto(`/?seed=${seed}&players=4`)
      await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

      const mapStats = await page.evaluate(() => {
        const mapGrid = window.gameState?.mapGrid || []
        const buildings = window.gameState?.buildings || []

        if (!Array.isArray(mapGrid) || mapGrid.length === 0 || !Array.isArray(mapGrid[0]) || mapGrid[0].length === 0) {
          throw new Error('mapGrid is not initialized')
        }

        const width = mapGrid[0].length
        const height = mapGrid.length
        const mapCenter = { x: Math.floor(width / 2), y: Math.floor(height / 2) }
        const dirs = [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 }
        ]

        const baseBuildings = buildings
          .filter(b => b.type === 'factory' || b.type === 'constructionYard')
          .sort((a, b) => String(a.owner || '').localeCompare(String(b.owner || '')))

        if (baseBuildings.length < 4) {
          throw new Error(`Expected 4 start bases, got ${baseBuildings.length}`)
        }

        function isStreet(x, y) {
          const tile = mapGrid[y]?.[x]
          return Boolean(tile && tile.type === 'street')
        }

        function nearestBaseDistance(x, y) {
          return Math.min(...baseBuildings.map(base => {
            const cx = base.x + Math.floor((base.width || 1) / 2)
            const cy = base.y + Math.floor((base.height || 1) / 2)
            return Math.abs(cx - x) + Math.abs(cy - y)
          }))
        }

        function getAdjacentStreetTiles(base) {
          const starts = []
          for (let y = base.y; y < base.y + (base.height || 1); y++) {
            for (let x = base.x; x < base.x + (base.width || 1); x++) {
              for (const dir of dirs) {
                const nx = x + dir.x
                const ny = y + dir.y
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
                if (isStreet(nx, ny)) starts.push({ x: nx, y: ny })
              }
            }
          }
          const unique = new Map(starts.map(tile => [`${tile.x},${tile.y}`, tile]))
          return [...unique.values()]
        }

        function shortestStreetDistanceToSeed(base) {
          const starts = getAdjacentStreetTiles(base)
          if (starts.length === 0) return null

          const visited = new Set()
          const queue = starts.map(tile => ({ ...tile, dist: 0 }))
          queue.forEach(tile => visited.add(`${tile.x},${tile.y}`))

          while (queue.length > 0) {
            const current = queue.shift()
            const tile = mapGrid[current.y]?.[current.x]
            if (tile?.seedCrystal) return current.dist

            for (const dir of dirs) {
              const nx = current.x + dir.x
              const ny = current.y + dir.y
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
              if (!isStreet(nx, ny)) continue

              const key = `${nx},${ny}`
              if (visited.has(key)) continue

              visited.add(key)
              queue.push({ x: nx, y: ny, dist: current.dist + 1 })
            }
          }

          return null
        }

        const seedCrystals = []
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (mapGrid[y][x].seedCrystal) {
              seedCrystals.push({ x, y })
            }
          }
        }

        const oreComponents = []
        const visitedOre = new Set()
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (!mapGrid[y][x].ore) continue
            const key = `${x},${y}`
            if (visitedOre.has(key)) continue

            const queue = [{ x, y }]
            visitedOre.add(key)
            let count = 0
            let hasSeed = false
            let sumX = 0
            let sumY = 0

            while (queue.length > 0) {
              const current = queue.shift()
              const tile = mapGrid[current.y][current.x]
              count += 1
              sumX += current.x
              sumY += current.y
              if (tile.seedCrystal) hasSeed = true

              for (const dir of dirs) {
                const nx = current.x + dir.x
                const ny = current.y + dir.y
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
                const nKey = `${nx},${ny}`
                if (visitedOre.has(nKey) || !mapGrid[ny][nx].ore) continue
                visitedOre.add(nKey)
                queue.push({ x: nx, y: ny })
              }
            }

            oreComponents.push({
              size: count,
              hasSeed,
              centerX: Math.round(sumX / count),
              centerY: Math.round(sumY / count)
            })
          }
        }

        const streetDistances = baseBuildings.map(base => ({
          owner: base.owner,
          distance: shortestStreetDistanceToSeed(base)
        }))

        const equalDistanceValues = [...new Set(streetDistances.map(item => item.distance))]

        const smallNearBaseComponents = oreComponents.filter(component =>
          component.hasSeed && component.size <= 90 && nearestBaseDistance(component.centerX, component.centerY) >= 24 && nearestBaseDistance(component.centerX, component.centerY) <= 36
        )

        const largeMiddleComponents = oreComponents.filter(component =>
          component.hasSeed && component.size >= 120 && Math.abs(component.centerX - mapCenter.x) + Math.abs(component.centerY - mapCenter.y) <= 26
        )

        const randomSpreadSignature = oreComponents
          .filter(component => component.hasSeed && component.size <= 110 && nearestBaseDistance(component.centerX, component.centerY) > 36)
          .map(component => `${component.centerX},${component.centerY}`)
          .sort()
          .join('|')

        return {
          streetDistances,
          equalDistanceCount: equalDistanceValues.length,
          firstDistance: equalDistanceValues[0],
          smallNearBaseCount: smallNearBaseComponents.length,
          largeMiddleCount: largeMiddleComponents.length,
          randomSpreadSignature,
          seedCrystalCount: seedCrystals.length
        }
      })

      expect(mapStats.equalDistanceCount, `street distance mismatch for seed ${seed}: ${JSON.stringify(mapStats.streetDistances)}`).toBe(1)
      expect(mapStats.firstDistance, `nearest seed street distance should be near 30 for seed ${seed}`).toBeGreaterThanOrEqual(24)
      expect(mapStats.firstDistance, `nearest seed street distance should be near 30 for seed ${seed}`).toBeLessThanOrEqual(36)
      expect(mapStats.smallNearBaseCount, `expected at least one small near-base ore field per player for seed ${seed}`).toBeGreaterThanOrEqual(4)
      expect(mapStats.largeMiddleCount, `expected a few larger middle ore fields for seed ${seed}`).toBeGreaterThanOrEqual(3)
      expect(mapStats.seedCrystalCount, `expected multiple seed crystals for seed ${seed}`).toBeGreaterThanOrEqual(10)

      randomSpreadSignatures.push(mapStats.randomSpreadSignature)
    }

    expect(new Set(randomSpreadSignatures).size, `random spread ore fields should vary with map seed: ${JSON.stringify(randomSpreadSignatures)}`).toBeGreaterThan(1)
  })
})
