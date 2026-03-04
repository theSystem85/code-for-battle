import { test, expect } from '@playwright/test'

test.describe('Map generation ore layout balance', () => {
  test('uses ore field count setting deterministically and keeps balanced near-base street access', async({ page }) => {
    const oreFieldCount = 12
    const seedsToCheck = ['11', '23']
    const spreadSignatures = []

    for (const seed of seedsToCheck) {
      await page.goto(`/?seed=${seed}&players=4&oreFieldCount=${oreFieldCount}`)
      await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

      await expect(page.locator('#mapOreFieldCount')).toHaveValue(String(oreFieldCount))

      const stats = await page.evaluate(() => {
        const mapGrid = window.gameState?.mapGrid || []
        const buildings = window.gameState?.buildings || []
        const configuredFieldCount = window.gameState?.mapOreFieldCount

        if (!Array.isArray(mapGrid) || mapGrid.length === 0 || !Array.isArray(mapGrid[0])) {
          throw new Error('mapGrid not initialized')
        }

        const width = mapGrid[0].length
        const height = mapGrid.length
        const center = { x: Math.floor(width / 2), y: Math.floor(height / 2) }
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

        const isStreet = (x, y) => mapGrid[y]?.[x]?.type === 'street'

        const nearestBaseDistance = (x, y) => Math.min(...baseBuildings.map(base => {
          const cx = base.x + Math.floor((base.width || 1) / 2)
          const cy = base.y + Math.floor((base.height || 1) / 2)
          return Math.abs(cx - x) + Math.abs(cy - y)
        }))

        function shortestStreetDistanceToSeed(base) {
          const queue = []
          const visited = new Set()

          for (let y = base.y; y < base.y + (base.height || 1); y++) {
            for (let x = base.x; x < base.x + (base.width || 1); x++) {
              for (const dir of dirs) {
                const nx = x + dir.x
                const ny = y + dir.y
                const key = `${nx},${ny}`
                if (nx < 0 || ny < 0 || nx >= width || ny >= height || !isStreet(nx, ny) || visited.has(key)) continue
                visited.add(key)
                queue.push({ x: nx, y: ny, dist: 0 })
              }
            }
          }

          while (queue.length > 0) {
            const current = queue.shift()
            if (mapGrid[current.y][current.x].seedCrystal) return current.dist

            for (const dir of dirs) {
              const nx = current.x + dir.x
              const ny = current.y + dir.y
              const key = `${nx},${ny}`
              if (nx < 0 || ny < 0 || nx >= width || ny >= height || !isStreet(nx, ny) || visited.has(key)) continue
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

        const nearSeedCount = seedCrystals.filter(seed => {
          const distance = nearestBaseDistance(seed.x, seed.y)
          return distance >= 24 && distance <= 36
        }).length

        const middleSeedCount = seedCrystals.filter(seed => {
          const d = Math.abs(seed.x - center.x) + Math.abs(seed.y - center.y)
          return d <= 26
        }).length

        const randomSpreadSignature = seedCrystals
          .filter(seed => nearestBaseDistance(seed.x, seed.y) > 36)
          .map(seed => `${seed.x},${seed.y}`)
          .sort()
          .join('|')

        const distances = baseBuildings.map(base => ({
          owner: base.owner,
          distance: shortestStreetDistanceToSeed(base)
        }))

        return {
          configuredFieldCount,
          seedCrystalCount: seedCrystals.length,
          nearSeedCount,
          middleSeedCount,
          randomSpreadSignature,
          distances,
          uniqueDistanceCount: new Set(distances.map(item => item.distance)).size,
          firstDistance: distances[0]?.distance ?? null
        }
      })

      expect(stats.configuredFieldCount).toBe(oreFieldCount)
      expect(stats.seedCrystalCount).toBe(oreFieldCount)
      expect(stats.uniqueDistanceCount, `street distances: ${JSON.stringify(stats.distances)}`).toBe(1)
      expect(stats.firstDistance).toBeGreaterThanOrEqual(24)
      expect(stats.firstDistance).toBeLessThanOrEqual(36)
      expect(stats.nearSeedCount).toBeGreaterThanOrEqual(4)
      expect(stats.middleSeedCount).toBeGreaterThanOrEqual(3)

      spreadSignatures.push(stats.randomSpreadSignature)
    }

    expect(new Set(spreadSignatures).size).toBeGreaterThan(1)

    await page.goto('/?seed=11&players=4&oreFieldCount=9')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await expect(page.locator('#mapOreFieldCount')).toHaveValue('9')
    const reducedSeedCount = await page.evaluate(() => {
      const mapGrid = window.gameState?.mapGrid || []
      let count = 0
      for (let y = 0; y < mapGrid.length; y++) {
        for (let x = 0; x < (mapGrid[y]?.length || 0); x++) {
          if (mapGrid[y][x].seedCrystal) count += 1
        }
      }
      return count
    })
    expect(reducedSeedCount).toBe(9)
  })
})
