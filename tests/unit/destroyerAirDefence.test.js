import { describe, it, expect, vi } from 'vitest'
import { DESTROYER_AIR_DEFENCE as weapon, updateDestroyerAirDefence, isAirDefenceTarget } from '../../src/game/unitCombat/destroyerCombat.js'
import { buildingData } from '../../src/data/buildingData.js'

vi.mock('../../src/sound.js', () => ({ playPositionalSound: vi.fn() }))

const ship = () => ({ type: 'destroyer', owner: 'player', x: 0, y: 0, health: 100, ammunition: 20, lastShotTime: 123 })
const aircraft = (type = 'apache', overrides = {}) => ({ type, owner: 'enemy', health: 100, flightState: 'airborne', x: 100, y: 0, ...overrides })

describe('Destroyer air defence', () => {
  it('[U07006] automatically launches at every supported airborne enemy type independently of cannon state', () => {
    for (const type of ['apache', 'f22Raptor', 'f35']) {
      const unit = ship()
      const target = aircraft(type)
      unit.target = { type: 'tank', health: 100 }
      const bullets = []
      updateDestroyerAirDefence(unit, [target], bullets, 0)
      expect(bullets).toHaveLength(1)
      expect(bullets[0]).toMatchObject({ target, homing: true, originType: 'rocketTurret', baseDamage: 36 })
      expect(unit.lastShotTime).toBe(123)
      expect(unit.target.type).toBe('tank')
      expect(unit.ammunition).toBe(19)
    }
  })

  it('[U07007] uses half the turret sustained damage with higher damage and slower fire', () => {
    const turret = buildingData.rocketTurret
    const cycle = turret.fireCooldown + (turret.burstCount - 1) * turret.burstDelay
    expect(weapon.damage / weapon.cooldown).toBeCloseTo(0.5 * turret.damage * turret.burstCount / cycle)
    expect(weapon.damage).toBeGreaterThan(turret.damage)
    expect(weapon.cooldown).toBeGreaterThan(cycle / turret.burstCount)
    const unit = ship()
    const bullets = []
    const target = aircraft()
    updateDestroyerAirDefence(unit, [target], bullets, 0)
    updateDestroyerAirDefence(unit, [target], bullets, weapon.cooldown - 1)
    expect(bullets).toHaveLength(1)
    updateDestroyerAirDefence(unit, [target], bullets, weapon.cooldown)
    expect(bullets).toHaveLength(2)
  })

  it('[U07008] ignores friendly, dead, grounded, carried and out-of-range targets', () => {
    const unit = ship()
    const bullets = []
    const invalid = [aircraft('apache', { owner: unit.owner }), aircraft('f35', { health: 0 }),
      aircraft('apache', { flightState: 'grounded' }), aircraft('f22Raptor', { embarkedOnId: 'carrier' }),
      aircraft('f35', { x: weapon.range + 1 })]
    updateDestroyerAirDefence(unit, invalid.filter(isAirDefenceTarget), bullets, 0)
    expect(bullets).toHaveLength(0)
    const boundary = aircraft('f35', { x: weapon.range })
    updateDestroyerAirDefence(unit, [boundary], bullets, 1)
    expect(bullets[0].target).toBe(boundary)
  })

  it('[U07009] respects empty ammunition and disabled firing', () => {
    for (const overrides of [{ ammunition: 0 }, { canFire: false }, { crew: { loader: false } }]) {
      const bullets = []
      updateDestroyerAirDefence(Object.assign(ship(), overrides), [aircraft()], bullets, 10000)
      expect(bullets).toHaveLength(0)
    }
  })
})
