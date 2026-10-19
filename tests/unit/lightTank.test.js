import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { UNIT_COSTS, UNIT_PROPERTIES, BULLET_DAMAGES, UNIT_AMMO_CAPACITY, UNIT_GAS_PROPERTIES, isTurretTankUnitType } from '../../src/config.js'
import { COMBAT_CONFIG, getBaseFireRateForTankType } from '../../src/game/unitCombat/combatConfig.js'
import { TRACKED_UNIT_TYPES } from '../../src/game/trackMarks.js'
import { TANK_ROTATION_VARIANTS } from '../../src/rendering/tankRotationCache.js'
import { computeAvailableUnitTypes } from '../../src/ai-api/techTree.js'
import tankImageConfigData from '../../src/tankImageConfig.json' with { type: 'json' }

const ROOT = process.cwd()
const PART_FILES = ['wagon', 'turret', 'barrel'].map(part => path.join(ROOT, `public/images/map/units/lightTank_${part}.webp`))

describe('light tank (M2 Bradley style IFV)', () => {
  it('[U02348] is cheaper, faster and lighter armored than tank V1', () => {
    expect(UNIT_COSTS.lightTank).toBeLessThan(UNIT_COSTS.tank_v1)
    expect(UNIT_PROPERTIES.lightTank.speed).toBeGreaterThan(UNIT_PROPERTIES.tank_v1.speed)
    expect(UNIT_PROPERTIES.lightTank.maxHealth).toBeLessThan(UNIT_PROPERTIES.tank_v1.maxHealth)
    expect(UNIT_PROPERTIES.lightTank.armor).toBeLessThan(1)
    expect(UNIT_AMMO_CAPACITY.lightTank).toBeGreaterThan(UNIT_AMMO_CAPACITY.tank_v1)
    expect(UNIT_GAS_PROPERTIES.lightTank).toBeDefined()
    expect(isTurretTankUnitType('lightTank')).toBe(true)
  })

  it('[U02349] fires the low-damage autocannon at one third of its former rate', () => {
    expect(getBaseFireRateForTankType('lightTank')).toBe(COMBAT_CONFIG.FIRE_RATES.LIGHT_TANK)
    expect(getBaseFireRateForTankType('tank_v1')).toBe(COMBAT_CONFIG.FIRE_RATES.STANDARD)
    expect(1000 / getBaseFireRateForTankType('lightTank')).toBeCloseTo(1 / 3)
    expect(BULLET_DAMAGES.lightTank).toBeLessThan(BULLET_DAMAGES.tank_v1)
  })

  it('[U02350] is unlocked by a vehicle factory', () => {
    const factory = { type: 'vehicleFactory', owner: 'player1', health: 100 }
    expect(computeAvailableUnitTypes([factory], [], 'player1').has('lightTank')).toBe(true)
    expect(computeAvailableUnitTypes([], [], 'player1').has('lightTank')).toBe(false)
  })

  it('[U02351] leaves track marks and uses the cached rotation pipeline', () => {
    expect(TRACKED_UNIT_TYPES.has('lightTank')).toBe(true)
    expect(TANK_ROTATION_VARIANTS).toContain('lightTank')
  })

  it('[U02352] has mount points inside its hull and turret sources', async() => {
    const cfg = tankImageConfigData.tankImageConfig.lightTank
    const [wagon, turret, barrel] = await Promise.all(PART_FILES.map(file => sharp(file).metadata()))
    expect(cfg.turretMountPoint.x).toBeGreaterThan(0)
    expect(cfg.turretMountPoint.x).toBeLessThan(wagon.width)
    expect(cfg.turretMountPoint.y).toBeLessThan(wagon.height)
    expect(cfg.barrelMountPoint.x).toBeLessThan(turret.width)
    // Barrel breech starts under the turret front, so the barrel never covers the turret body.
    const barrelTop = cfg.barrelMountPoint.y - barrel.height / 2
    expect(barrelTop).toBeGreaterThan(turret.height * 0.85)
    expect(barrelTop).toBeLessThan(turret.height)
    expect(cfg.muzzleFlashOffset.y).toBe(barrel.height)
  })

  it('[U02353] ships 1x/2x/3x prepared parts downsampled from larger sources', async() => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, 'public/images/prepared/sprite-manifest.json'), 'utf8'))
    for (const part of ['wagon', 'turret', 'barrel']) {
      const entry = manifest.entries.find(e => e.id === `unit:lightTank:${part}`)
      expect(entry).toBeDefined()
      expect(entry.variants.map(v => v.density).sort()).toEqual([1, 2, 3])
      for (const d of [1, 2, 3]) {
        expect(existsSync(path.join(ROOT, `public/images/prepared/unit/lightTank/${part}@${d}x.webp`))).toBe(true)
      }
      const source = await sharp(path.join(ROOT, `public/images/map/units/lightTank_${part}.webp`)).metadata()
      const threeX = await sharp(path.join(ROOT, `public/images/prepared/unit/lightTank/${part}@3x.webp`)).metadata()
      expect(source.height).toBeGreaterThanOrEqual(threeX.height)
    }
  })
})
