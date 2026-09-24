import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const profileEnabled = process.env.HEAVY_BATTLE_PROFILE === '1'
const backend = process.env.HEAVY_BATTLE_BACKEND || 'webgpu'
const mapSize = process.env.HEAVY_BATTLE_MAP_SIZE || '96'
const unitCount = process.env.HEAVY_BATTLE_UNITS || '240'
const durationMs = process.env.HEAVY_BATTLE_DURATION_MS || '5000'
const warmupMs = process.env.HEAVY_BATTLE_WARMUP_MS || '2000'
const outputPath = process.env.HEAVY_BATTLE_OUT || `artifacts/heavy-battle-${backend}.json`

test.describe('heavy battle frame profile', () => {
  test.skip(!profileEnabled, 'Set HEAVY_BATTLE_PROFILE=1 to run the heavy-battle frame profile')

  test('records phase timings for a scripted late-game battle', async({ page, baseURL }) => {
    test.setTimeout(180000)
    await page.addInitScript((rendererBackend) => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
      localStorage.setItem('rts-shadow-of-war-enabled', 'true')
      localStorage.setItem('rts_graphics_settings', JSON.stringify({
        useProceduralWaterRendering: true,
        waterEffectTone: 0.35,
        waterEffectSaturation: 0.4,
        mobileCanvasPixelRatioCap: 1,
        rendererBackend,
        rendererBackendChoice: rendererBackend
      }))
    }, backend)

    const url = new URL('/', baseURL || 'http://localhost:5173')
    url.searchParams.set('seed', '11')
    url.searchParams.set('size', mapSize)
    url.searchParams.set('players', '4')
    url.searchParams.set('heavyBattle', '1')
    url.searchParams.set('battleUnits', unitCount)
    url.searchParams.set('benchmarkDurationMs', durationMs)
    url.searchParams.set('heavyBattleWarmupMs', warmupMs)
    url.searchParams.set('framePhases', '1')

    await page.goto(url.toString())
    await page.waitForFunction(() => window.__heavyBattleResult || window.__heavyBattleError, null, { timeout: 150000 })
    const result = await page.evaluate(() => window.__heavyBattleResult || { ok: false, error: window.__heavyBattleError })
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))
    console.log(`Heavy battle profile written to ${outputPath}`)
    expect(result.ok).toBe(true)
    expect(result.counts.units).toBeGreaterThan(100)
    expect(result.phases.samples).toBeGreaterThan(10)
    expect(result.phases.phases.sim.samples).toBeGreaterThan(10)
  })
})
