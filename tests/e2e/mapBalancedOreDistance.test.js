import { test, expect } from '@playwright/test'

test.describe('Map generation balanced ore distance', () => {
  test('keeps nearest street distance to seed crystals equal for all parties', async({ page }) => {
    const seedsToCheck = ['11', '23', '77']

    for (const seed of seedsToCheck) {
      await page.goto(`/?seed=${seed}&players=4`)
      await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

      const balanceResult = await page.evaluate(() => {
        const mapGrid = window.gameState?.mapGrid || []
        const buildings = window.gameState?.buildings || []

        if (!Array.isArray(mapGrid) || mapGrid.length === 0 || !Array.isArray(mapGrid[0]) || mapGrid[0].length === 0) {
          throw new Error('mapGrid is not initialized')
        }

        const width = mapGrid[0].length
        const height = mapGrid.length
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

        function isStreetTile(x, y) {
          const tile = mapGrid[y]?.[x]
          return Boolean(tile && tile.type === 'street')
        }

        function findStreetStartTiles(base) {
          const starts = []
          for (let y = base.y; y < base.y + (base.height || 1); y++) {
            for (let x = base.x; x < base.x + (base.width || 1); x++) {
              for (const dir of dirs) {
                const nx = x + dir.x
                const ny = y + dir.y
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
                if (isStreetTile(nx, ny)) {
                  starts.push({ x: nx, y: ny })
                }
              }
            }
          }

          const unique = new Map()
          starts.forEach(pos => unique.set(`${pos.x},${pos.y}`, pos))
          return [...unique.values()]
        }

        function shortestStreetDistanceToSeedCrystal(base) {
          const starts = findStreetStartTiles(base)
          if (starts.length === 0) return null

          const visited = new Set()
          const queue = starts.map(pos => ({ ...pos, dist: 0 }))

          queue.forEach(pos => visited.add(`${pos.x},${pos.y}`))

          while (queue.length > 0) {
            const current = queue.shift()
            const tile = mapGrid[current.y]?.[current.x]
            if (tile?.seedCrystal) {
              return current.dist
            }

            for (const dir of dirs) {
              const nx = current.x + dir.x
              const ny = current.y + dir.y
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
              if (!isStreetTile(nx, ny)) continue

              const key = `${nx},${ny}`
              if (visited.has(key)) continue

              visited.add(key)
              queue.push({ x: nx, y: ny, dist: current.dist + 1 })
            }
          }

          return null
        }

        const distances = baseBuildings.map(base => ({
          owner: base.owner,
          distance: shortestStreetDistanceToSeedCrystal(base)
        }))

        const unreachable = distances.filter(entry => entry.distance === null)
        if (unreachable.length > 0) {
          throw new Error(`Unreachable seed crystal by street for: ${unreachable.map(e => e.owner).join(', ')}`)
        }

        const uniqueDistances = [...new Set(distances.map(d => d.distance))]
        return {
          distances,
          uniqueDistanceCount: uniqueDistances.length
        }
      })

      expect(balanceResult.uniqueDistanceCount, `seed=${seed} distances=${JSON.stringify(balanceResult.distances)}`).toBe(1)
    }
  })
})
