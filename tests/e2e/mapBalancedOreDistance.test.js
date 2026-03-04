import { test, expect } from '@playwright/test'

test.describe('Map generation ore field count rules', () => {
  test('supports OFC=0 and applies center/near/spread placement rules with immediate map updates', async({ page }) => {
    await page.goto('/?seed=11&players=4&oreFieldCount=0')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.locator('#mapSettingsToggle').click()

    await expect(page.locator('#mapOreFieldCount')).toHaveValue('0')

    const zeroStats = await page.evaluate(() => {
      const mapGrid = window.gameState?.mapGrid || []
      const buildings = window.gameState?.buildings || []
      const bases = buildings.filter(b => b.type === 'factory' || b.type === 'constructionYard')
      const center = { x: Math.floor((mapGrid[0]?.length || 0) / 2), y: Math.floor(mapGrid.length / 2) }

      const seeds = []
      for (let y = 0; y < mapGrid.length; y++) {
        for (let x = 0; x < (mapGrid[y]?.length || 0); x++) {
          if (mapGrid[y][x].seedCrystal) seeds.push({ x, y })
        }
      }

      const nearestBaseDistance = (x, y) => Math.min(...bases.map(base => {
        const cx = base.x + Math.floor((base.width || 1) / 2)
        const cy = base.y + Math.floor((base.height || 1) / 2)
        return Math.abs(cx - x) + Math.abs(cy - y)
      }))

      const centerSeeds = seeds.filter(seed => Math.abs(seed.x - center.x) + Math.abs(seed.y - center.y) <= 26).length
      const nearSeeds = seeds.filter(seed => {
        const d = nearestBaseDistance(seed.x, seed.y)
        return d >= 24 && d <= 36
      }).length

      return {
        mapOreFieldCount: window.gameState?.mapOreFieldCount,
        seedCrystalCount: seeds.length,
        centerSeeds,
        nearSeeds
      }
    })

    expect(zeroStats.mapOreFieldCount).toBe(0)
    expect(zeroStats.seedCrystalCount).toBe(0)

    // Immediate update check: change OFC in the input (no shuffle button) and verify map regenerates instantly.
    await page.locator('#mapOreFieldCount').fill('6')
    await page.locator('#mapOreFieldCount').dispatchEvent('change')

    await expect.poll(async() => {
      return page.evaluate(() => {
        const mapGrid = window.gameState?.mapGrid || []
        let count = 0
        for (let y = 0; y < mapGrid.length; y++) {
          for (let x = 0; x < (mapGrid[y]?.length || 0); x++) {
            if (mapGrid[y][x].seedCrystal) count += 1
          }
        }
        return count
      })
    }, { timeout: 10000 }).toBe(6)

    const ofcSixStats = await page.evaluate(() => {
      const mapGrid = window.gameState?.mapGrid || []
      const buildings = window.gameState?.buildings || []
      const bases = buildings.filter(b => b.type === 'factory' || b.type === 'constructionYard')
      const center = { x: Math.floor((mapGrid[0]?.length || 0) / 2), y: Math.floor(mapGrid.length / 2) }

      const seeds = []
      for (let y = 0; y < mapGrid.length; y++) {
        for (let x = 0; x < (mapGrid[y]?.length || 0); x++) {
          if (mapGrid[y][x].seedCrystal) seeds.push({ x, y })
        }
      }

      const nearestBaseDistance = (x, y) => Math.min(...bases.map(base => {
        const cx = base.x + Math.floor((base.width || 1) / 2)
        const cy = base.y + Math.floor((base.height || 1) / 2)
        return Math.abs(cx - x) + Math.abs(cy - y)
      }))

      const centerSeeds = seeds.filter(seed => Math.abs(seed.x - center.x) + Math.abs(seed.y - center.y) <= 26).length
      const nearSeeds = seeds.filter(seed => {
        const d = nearestBaseDistance(seed.x, seed.y)
        return d >= 24 && d <= 36
      }).length

      return {
        ofc: window.gameState?.mapOreFieldCount,
        seedCount: seeds.length,
        centerSeeds,
        nearSeeds
      }
    })

    // parties=4 and OFC=6 => 4 near + 2 center + 0 spread
    expect(ofcSixStats.ofc).toBe(6)
    expect(ofcSixStats.seedCount).toBe(6)
    expect(ofcSixStats.nearSeeds).toBeGreaterThanOrEqual(4)
    expect(ofcSixStats.centerSeeds).toBeGreaterThanOrEqual(2)

    // parties=4 and OFC=10 => 4 near + up to 4 center + remaining spread (2)
    await page.locator('#mapOreFieldCount').fill('10')
    await page.locator('#mapOreFieldCount').dispatchEvent('change')
    await expect.poll(async() => {
      return page.evaluate(() => window.gameState?.mapOreFieldCount)
    }).toBe(10)

    const ofcTenStats = await page.evaluate(() => {
      const mapGrid = window.gameState?.mapGrid || []
      const buildings = window.gameState?.buildings || []
      const bases = buildings.filter(b => b.type === 'factory' || b.type === 'constructionYard')
      const center = { x: Math.floor((mapGrid[0]?.length || 0) / 2), y: Math.floor(mapGrid.length / 2) }

      const seeds = []
      for (let y = 0; y < mapGrid.length; y++) {
        for (let x = 0; x < (mapGrid[y]?.length || 0); x++) {
          if (mapGrid[y][x].seedCrystal) seeds.push({ x, y })
        }
      }

      const nearestBaseDistance = (x, y) => Math.min(...bases.map(base => {
        const cx = base.x + Math.floor((base.width || 1) / 2)
        const cy = base.y + Math.floor((base.height || 1) / 2)
        return Math.abs(cx - x) + Math.abs(cy - y)
      }))

      const centerSeeds = seeds.filter(seed => Math.abs(seed.x - center.x) + Math.abs(seed.y - center.y) <= 26).length
      const nearSeeds = seeds.filter(seed => {
        const d = nearestBaseDistance(seed.x, seed.y)
        return d >= 24 && d <= 36
      }).length
      const spreadSeeds = seeds.filter(seed => {
        const near = (() => {
          const d = nearestBaseDistance(seed.x, seed.y)
          return d >= 24 && d <= 36
        })()
        const centerSeed = Math.abs(seed.x - center.x) + Math.abs(seed.y - center.y) <= 26
        return !near && !centerSeed
      }).length

      return {
        seedCount: seeds.length,
        nearSeeds,
        centerSeeds,
        spreadSeeds,
        signature: seeds.map(seed => `${seed.x},${seed.y}`).sort().join('|')
      }
    })

    expect(ofcTenStats.seedCount).toBe(10)
    expect(ofcTenStats.nearSeeds).toBeGreaterThanOrEqual(4)
    expect(ofcTenStats.centerSeeds).toBeGreaterThanOrEqual(4)
    expect(ofcTenStats.spreadSeeds).toBeGreaterThanOrEqual(1)

    // Determinism for same seed+settings and variation for different seeds.
    const signatureSameSeed = ofcTenStats.signature
    await page.locator('#mapSeed').fill('11')
    await page.locator('#mapSeed').dispatchEvent('change')

    const signatureSameAgain = await page.evaluate(() => {
      const mapGrid = window.gameState?.mapGrid || []
      const seeds = []
      for (let y = 0; y < mapGrid.length; y++) {
        for (let x = 0; x < (mapGrid[y]?.length || 0); x++) {
          if (mapGrid[y][x].seedCrystal) seeds.push(`${x},${y}`)
        }
      }
      return seeds.sort().join('|')
    })
    expect(signatureSameAgain).toBe(signatureSameSeed)

    await page.locator('#mapSeed').fill('12')
    await page.locator('#mapSeed').dispatchEvent('change')

    const signatureDifferentSeed = await page.evaluate(() => {
      const mapGrid = window.gameState?.mapGrid || []
      const seeds = []
      for (let y = 0; y < mapGrid.length; y++) {
        for (let x = 0; x < (mapGrid[y]?.length || 0); x++) {
          if (mapGrid[y][x].seedCrystal) seeds.push(`${x},${y}`)
        }
      }
      return seeds.sort().join('|')
    })
    expect(signatureDifferentSeed).not.toBe(signatureSameSeed)
  })
})
