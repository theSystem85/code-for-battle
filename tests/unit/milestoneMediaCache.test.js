import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  MILESTONE_VIDEO_FADE_MS,
  clearMilestoneMediaPreload,
  computeMilestoneVideoOpacity,
  isMilestoneMediaPreloaded,
  preloadMilestoneForProduction,
  preloadMilestoneMedia,
  setMilestoneAchievedCheck
} from '../../src/ui/milestoneMediaCache.js'
import { videoOverlay } from '../../src/ui/videoOverlay.js'

describe('milestone media preload and fade', () => {
  beforeEach(() => {
    clearMilestoneMediaPreload()
    setMilestoneAchievedCheck(null)
  })

  afterEach(() => {
    clearMilestoneMediaPreload()
    setMilestoneAchievedCheck(null)
  })

  it('preloads a milestone clip when production starts and the milestone is still open', () => {
    const achieved = new Set()
    setMilestoneAchievedCheck(id => achieved.has(id))

    expect(preloadMilestoneForProduction('mineLayer', false)).toBe('first_mine_layer')
    expect(preloadMilestoneForProduction('mineSweeper', false)).toBe('first_mine_sweeper')
    expect(preloadMilestoneForProduction('rocketTank', false)).toBe('first_rocket_tank')
    expect(preloadMilestoneForProduction('howitzer', false)).toBe('first_artillery')
    expect(preloadMilestoneForProduction('tank', false)).toBe('first_tank')
    expect(preloadMilestoneForProduction('oreRefinery', true)).toBe('tank_over_crystals')
    expect(preloadMilestoneForProduction('teslaCoil', true)).toBe('tesla_coil_hits_tank')
    expect(preloadMilestoneForProduction('airstrip', true)).toBe('air_strip')

    expect(isMilestoneMediaPreloaded('first_mine_layer')).toBe(true)
    expect(videoOverlay.isVideoPlaying()).toBe(false)
    expect(videoOverlay.getCurrentVideo()).toBeFalsy()
  })

  it('does not preload once the milestone is achieved and ignores unrelated production', () => {
    setMilestoneAchievedCheck(id => id === 'firstHowitzer' || id === 'firstTank')
    expect(preloadMilestoneForProduction('howitzer', false)).toBeNull()
    expect(preloadMilestoneForProduction('tank_v1', false)).toBeNull()
    expect(preloadMilestoneForProduction('harvester', false)).toBeNull()
    expect(preloadMilestoneForProduction('powerPlant', true)).toBeNull()
    expect(isMilestoneMediaPreloaded('first_artillery')).toBe(false)
    expect(isMilestoneMediaPreloaded('first_tank')).toBe(false)
  })

  it('records a preload without starting playback', () => {
    preloadMilestoneMedia('first_rocket_tank')
    expect(isMilestoneMediaPreloaded('first_rocket_tank')).toBe(true)
    preloadMilestoneMedia('first_rocket_tank')
    expect(videoOverlay.isVideoPlaying()).toBe(false)
  })

  it('fades milestone video opacity in and out over 220ms', () => {
    const start = 1000
    expect(computeMilestoneVideoOpacity(false, start, start, 6, 0)).toBe(0)
    expect(computeMilestoneVideoOpacity(true, 0, start, 6, 0)).toBe(1)
    expect(computeMilestoneVideoOpacity(true, start, start, 6, 0)).toBe(0)
    expect(computeMilestoneVideoOpacity(true, start, start + MILESTONE_VIDEO_FADE_MS / 2, 6, 0)).toBeCloseTo(0.5)
    expect(computeMilestoneVideoOpacity(true, start, start + MILESTONE_VIDEO_FADE_MS, 6, 1)).toBe(1)
    expect(computeMilestoneVideoOpacity(true, start, start + 3000, 6, 6 - (MILESTONE_VIDEO_FADE_MS / 2000))).toBeCloseTo(0.5)
    expect(computeMilestoneVideoOpacity(true, start, start + 3000, 6, 6)).toBe(0)
  })
})
