import { describe, expect, it, vi } from 'vitest'
import { COASTAL_SHALLOWS_ENABLED, UNIT_PROPERTIES, USE_OCEAN_WATER_RENDERING, setGraphicsTunerOptions } from '../../src/config.js'
import { buildingData } from '../../src/data/buildingData.js'
import { GRAPHICS_BATTLE_VIEW, graphicsBattleLayout, validateGraphicsBattleLayout } from '../../src/benchmark/graphicsTunerLayout.js'
import {
  GRAPHICS_TUNER_FEATURES, buildGraphicsProfiles, rankGraphicsCosts, recommendGraphicsProfile,
  graphicsCadenceDeadline, reachesGraphicsGoal, summarizeGraphicsFrames
} from '../../src/benchmark/graphicsTunerModel.js'
import { loadGraphicsTunerReport, storeGraphicsTunerReport } from '../../src/benchmark/graphicsTunerReportStore.js'

function measurements(deviceDensity, overrides) {
  return buildGraphicsProfiles(deviceDensity).map(profile => {
    const interval = overrides[profile.id] ?? 27
    return { ...profile, metrics: summarizeGraphicsFrames(Array.from({ length: 12 }, () => ({ interval, update: 4, render: 6 }))) }
  })
}

describe('graphics tuner', () => {
  it('[U07220] covers each building and unit in the opening camera without occupied spawn cells or misplaced hulls', () => {
    const layout = graphicsBattleLayout()
    expect(new Set(layout.structures.map(structure => structure.type))).toEqual(new Set(Object.keys(buildingData)))
    expect(new Set(layout.spawns.map(unit => unit.type))).toEqual(new Set(Object.keys(UNIT_PROPERTIES).filter(type => type !== 'base')))
    expect(() => validateGraphicsBattleLayout(layout)).not.toThrow()
    for (const { type, x, y } of layout.structures) {
      expect(x).toBeGreaterThanOrEqual(GRAPHICS_BATTLE_VIEW.x)
      expect(y).toBeGreaterThanOrEqual(GRAPHICS_BATTLE_VIEW.y)
      expect(x + buildingData[type].width).toBeLessThanOrEqual(GRAPHICS_BATTLE_VIEW.x + GRAPHICS_BATTLE_VIEW.width)
      expect(y + buildingData[type].height).toBeLessThanOrEqual(GRAPHICS_BATTLE_VIEW.y + GRAPHICS_BATTLE_VIEW.height)
    }
    const carrier = layout.spawns.find(unit => unit.type === 'aircraftCarrier')
    carrier.y -= 7
    expect(() => validateGraphicsBattleLayout(layout)).toThrow('aircraftCarrier')
  })

  it('[U07221] tests DPR 1 through 3 and changes only one setting per comparison', () => {
    const [reference, ...profiles] = buildGraphicsProfiles(2.75)
    for (const { key } of GRAPHICS_TUNER_FEATURES) {
      const expected = key === 'density' ? [1, 2, 3] : [false, true]
      expect(new Set([reference, ...profiles.filter(profile => profile.id.startsWith(`${key}:`))]
        .map(profile => profile.settings[key]))).toEqual(new Set(expected))
    }
    for (const profile of profiles) {
      expect(Object.keys(profile.settings).filter(key => profile.settings[key] !== reference.settings[key])).toHaveLength(1)
    }
  })

  it('[U07222] uses elapsed time for FPS, tracks outliers, and distinguishes a low refresh display', () => {
    const sample = interval => ({ interval, update: 4, render: 5 })
    const steady = summarizeGraphicsFrames([sample(16.6), sample(16.7), sample(16.6)])
    expect(reachesGraphicsGoal({ metrics: steady }, 60)).toBe(true)
    expect(reachesGraphicsGoal({ metrics: steady }, 50)).toBe(false)
    const slow = summarizeGraphicsFrames([sample(10), sample(30)])
    expect(slow).toMatchObject({ fps: 50, p95: 30, p99: 30, missed: 1, cadenceMisses: 1 })
    expect(reachesGraphicsGoal({ metrics: slow }, 60)).toBe(false)
  })

  it('[U07227] benchmarks each water effect independently and switches the corresponding renderer setting', () => {
    const profiles = buildGraphicsProfiles(2)
    const reference = profiles[0].settings
    const coastalOff = profiles.find(profile => profile.id === 'coastalShallows:false').settings
    const oceanOff = profiles.find(profile => profile.id === 'oceanWater:false').settings
    expect(coastalOff).toEqual({ ...reference, coastalShallows: false })
    expect(oceanOff).toEqual({ ...reference, oceanWater: false })
    const previous = { coastalShallows: COASTAL_SHALLOWS_ENABLED, oceanWater: USE_OCEAN_WATER_RENDERING }
    try {
      setGraphicsTunerOptions({ coastalShallows: coastalOff.coastalShallows, oceanWater: coastalOff.oceanWater }, { persist: false, notify: false })
      expect(COASTAL_SHALLOWS_ENABLED).toBe(false)
      expect(USE_OCEAN_WATER_RENDERING).toBe(true)
      setGraphicsTunerOptions({ coastalShallows: oceanOff.coastalShallows, oceanWater: oceanOff.oceanWater }, { persist: false, notify: false })
      expect(COASTAL_SHALLOWS_ENABLED).toBe(true)
      expect(USE_OCEAN_WATER_RENDERING).toBe(false)
    } finally {
      setGraphicsTunerOptions(previous, { persist: false, notify: false })
    }
  })

  it('[U07223] ranks measured costs and confirms the combined proposal on the device', async() => {
    const profiles = measurements(3, { 'density:2': 23, 'density:1': 21, 'shadows:false': 24, 'smoke:false': 25 })
    const ranking = rankGraphicsCosts(profiles)
    expect(ranking.map(entry => entry.key).slice(0, 3)).toEqual(['density', 'shadows', 'smoke'])
    const measure = vi.fn(async profile => ({ ...profile, metrics: summarizeGraphicsFrames([{ interval: 16, update: 4, render: 6 }]) }))
    const recommendation = await recommendGraphicsProfile(profiles, ranking, 60, measure)
    expect(measure).toHaveBeenCalledTimes(1)
    expect(recommendation.settings).toMatchObject({ density: 1, shadows: false, smoke: true })
    expect(reachesGraphicsGoal(recommendation, 60)).toBe(true)
  })

  it('[U07224] falls back to the fastest measured result when no combination meets the target', async() => {
    const profiles = measurements(2, { 'density:3': 18, 'customSprites:false': 20 })
    const ranking = rankGraphicsCosts(profiles)
    const measure = vi.fn(async profile => ({ ...profile, metrics: summarizeGraphicsFrames([{ interval: 23, update: 4, render: 6 }]) }))
    const result = await recommendGraphicsProfile(profiles, ranking, 55, measure)
    expect(result.id).toBe('customSprites:false')
    expect(reachesGraphicsGoal(result, 55)).toBe(false)
  })

  it('[U07225] preserves visual options when a steady 60 Hz display has callback jitter', async() => {
    const profiles = buildGraphicsProfiles(2).map(profile => ({
      ...profile,
      metrics: summarizeGraphicsFrames([15.8, 17.5, 16.7].map(interval => ({ interval, update: 2, render: 2 })), graphicsCadenceDeadline(60))
    }))
    expect(profiles[0].metrics).toMatchObject({ missed: 2, cadenceMisses: 0 })
    const measure = vi.fn()
    await expect(recommendGraphicsProfile(profiles, rankGraphicsCosts(profiles), 60, measure))
      .resolves.toMatchObject({ id: 'reference', settings: { density: 2, shadows: true, smoke: true } })
    expect(measure).not.toHaveBeenCalled()
    const missed = summarizeGraphicsFrames([{ interval: 33.3, update: 2, render: 2 }], graphicsCadenceDeadline(60))
    expect(missed.cadenceMisses).toBe(1)
  })

  it('[U07226] replaces the previous device report when a new run completes', () => {
    const first = { recordedAt: '2026-11-18', ranking: [], recommendation: { settings: { density: 2 } } }
    const latest = { ...first, recordedAt: '2026-11-19', recommendation: { settings: { density: 1 } } }
    storeGraphicsTunerReport(first)
    expect(loadGraphicsTunerReport()).toEqual(first)
    storeGraphicsTunerReport(latest)
    expect(loadGraphicsTunerReport()).toEqual(latest)
  })
})
