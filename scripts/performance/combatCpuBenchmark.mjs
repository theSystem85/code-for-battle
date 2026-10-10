// Focused identical fixtures supplement (never replace) live frame benchmarks.
import fs from 'node:fs'
import process from 'node:process'
import console from 'node:console'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: process.env.PERF_HEADED !== '1' })
try {
  const page = await browser.newPage({ deviceScaleFactor: 2 })
  const baseURL = process.env.PERF_BASE_URL || 'http://127.0.0.1:5173'
  await page.goto(`${baseURL}/?seed=11&size=100&players=4&heavyBattle=1&battleUnits=40&benchmarkDurationMs=5000&heavyBattleWarmupMs=0`)
  await page.waitForFunction(() => globalThis.window.gameInstance?.gameLoop?.running, null, { timeout: 120000 })
  const result = await page.evaluate(async(optimized) => {
    const { window, performance } = globalThis
    window.gameInstance.gameLoop.stop()
    const { TILE_SIZE } = await import('/src/config.js')
    const { hasClearShot } = await import('/src/logic.js')
    const { hasFriendlyUnitOnTile } = await import('/src/game/movementCore.js')
    const { rebuildOwnerUnitIndex } = await import('/src/game/unitOwnerIndex.js')
    const map = Array.from({ length: 100 }, () => Array.from({ length: 100 }, () => ({ type: 'land', building: false })))
    const rows = []
    for (const count of [40, 200, 320, 500]) {
      let seed = 777
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
      const units = Array.from({ length: count }, (_, id) => {
        const x = random() * 2800
        const y = random() * 2800
        return { id, x, y, tileX: Math.floor((x + TILE_SIZE / 2) / TILE_SIZE), tileY: Math.floor((y + TILE_SIZE / 2) / TILE_SIZE), health: 100, type: 'tank', owner: `player${id % 4 + 1}` }
      })
      const targets = units.map(unit => {
        const x = Math.min(2800, unit.x + 256)
        const y = Math.min(2800, unit.y + 64)
        return { x, y, tileX: Math.floor((x + TILE_SIZE / 2) / TILE_SIZE), tileY: Math.floor((y + TILE_SIZE / 2) / TILE_SIZE), owner: 'target' }
      })
      let occupied = 0
      let clear = 0
      let clearLong = 0
      const samples = []
      // Each sample represents 60 simulation passes with a fresh index per
      // pass. Movement queries use live positions; shots preserve exact tests.
      for (let sample = 0; sample < 5; sample++) {
        let movementMs = 0
        let shotsMs = 0
        let longShotsMs = 0
        for (let pass = 0; pass < 60; pass++) {
          rebuildOwnerUnitIndex(units)
          const start = performance.now()
          for (let index = 0; index < count; index++) {
            const unit = units[index]
            if (hasFriendlyUnitOnTile(unit, unit.tileX + 1, unit.tileY, units)) occupied++
          }
          movementMs += performance.now() - start
          const shotStart = performance.now()
          for (let index = 0; index < count; index++) {
            if (hasClearShot(units[index], targets[index], units, map)) clear++
          }
          shotsMs += performance.now() - shotStart
          const longStart = performance.now()
          for (let index = 0; index < count; index++) {
            if (hasClearShot(units[index], units[(index + 11) % count], units, map)) clearLong++
          }
          longShotsMs += performance.now() - longStart
        }
        samples.push({ movementMs, shotsMs, longShotsMs })
      }
      rows.push({ count, occupied, clear, clearLong, samples })
    }
    return { optimized, rows, dpr: window.devicePixelRatio, certification: 'CPU diagnostic only; identical seeded fixtures, no presented FPS claim' }
  }, process.env.CPU_OPTIMIZED === '1')
  fs.writeFileSync(process.argv[2] || '/tmp/combat-cpu.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally {
  await browser.close()
}
