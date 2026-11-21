import { afterEach, describe, expect, it, vi } from 'vitest'
import { awardExperience } from '../../src/utils.js'
import {
  applyKillBonus,
  applyLevelUps,
  canEarnVeterancy,
  getKillValue,
  setStarGrantListener,
  setTurretVeterancyGate
} from '../../src/game/veterancy.js'

const tank = (overrides = {}) => ({
  type: 'tank', owner: 'player1', level: 0, experience: 0, baseCost: 1000, ...overrides
})

describe('veterancy', () => {
  afterEach(() => {
    setStarGrantListener(null)
    setTurretVeterancyGate(null)
    delete globalThis.window
  })

  it('[U07281] uses real building costs for kill XP', () => {
    const killer = tank()
    awardExperience(killer, { type: 'concreteWall', owner: 'enemy' })
    expect(getKillValue({ type: 'concreteWall' })).toBe(100)
    expect(killer.experience).toBe(300)
  })

  it('[U07282] warns once and awards no XP for each unknown type', () => {
    const warn = vi.fn()
    globalThis.window = { logger: { warn } }
    const killer = tank()
    awardExperience(killer, { type: 'mystery', owner: 'enemy' })
    awardExperience(killer, { type: 'mystery', owner: 'enemy' })
    expect(killer.experience).toBe(0)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('[U07283] carries overflow through multiple levels, grants one batch, and caps cleanly', () => {
    const listener = vi.fn()
    setStarGrantListener(listener)
    const unit = tank({ experience: 20_000 })
    expect(applyLevelUps(unit)).toBe(3)
    expect(unit).toMatchObject({ level: 3, experience: 0 })
    expect(listener).toHaveBeenCalledWith(unit, 3)
  })

  it.each([
    [0, 0, 0], [1, 0, 1000], [2, 1, 0], [3, 1, 2000]
  ])('[U07284] converts a %i-star victim on the killer ladder', (victimLevel, expectedLevel, expectedXp) => {
    const killer = tank()
    applyKillBonus(killer, tank({ owner: 'enemy', level: victimLevel }))
    expect(killer).toMatchObject({ level: expectedLevel, experience: expectedXp })
  })

  it('[U07285] uses the current ladder and preserves partial XP for the worked example', () => {
    const killer = tank({ level: 1, experience: 1000 })
    awardExperience(killer, tank({ owner: 'enemy', level: 2 }))
    expect(killer).toMatchObject({ level: 3, experience: 0 })
  })

  it('[U07286] does not grant kill bonuses for friendly victims or harvester killers', () => {
    const friendlyKiller = tank()
    applyKillBonus(friendlyKiller, tank({ level: 3 }))
    expect(friendlyKiller.experience).toBe(0)
    const harvester = { type: 'harvester', owner: 'player1', level: 0, experience: 0 }
    applyKillBonus(harvester, tank({ owner: 'enemy', level: 3 }))
    expect(harvester.experience).toBe(0)
  })

  it('[U07280] gates turret XP and applies its bonuses in the specified order', () => {
    const turret = { type: 'turretGunV1', owner: 'player1', level: 0, experience: 100_000, baseCost: 1000, armor: 2 }
    expect(canEarnVeterancy(turret)).toBe(false)
    expect(applyLevelUps(turret)).toBe(0)
    setTurretVeterancyGate(() => true)
    expect(applyLevelUps(turret)).toBe(3)
    expect(turret).toMatchObject({ level: 3, experience: 0, rangeMultiplier: 1.2, fireRateMultiplier: 1.33, armor: 3, selfRepair: true })
  })
})
