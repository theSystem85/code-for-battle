import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  UNIT_SPRITE_FACING,
  LEGACY_NON_SOUTH_UNIT_SPRITES,
  CANONICAL_UNIT_FACING,
  facingRotationOffset
} from '../../src/rendering/unitSpriteFacing.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const unitsDir = resolve(__dirname, '../../public/images/map/units')
const tankConfig = JSON.parse(readFileSync(resolve(__dirname, '../../src/tankImageConfig.json'), 'utf8')).tankImageConfig

describe('unit sprite facing metadata', () => {
  it('declares a facing for every unit map asset', () => {
    const files = readdirSync(unitsDir).filter(name => name.endsWith('.webp')).sort()
    expect(files.filter(name => !UNIT_SPRITE_FACING[name])).toEqual([])
    expect(Object.keys(UNIT_SPRITE_FACING).filter(name => !files.includes(name))).toEqual([])
  })

  it('only allows the frozen legacy set to deviate from the canonical south facing', () => {
    const nonSouth = Object.entries(UNIT_SPRITE_FACING)
      .filter(([, facing]) => facing !== CANONICAL_UNIT_FACING && facing !== 'symmetric')
      .map(([name]) => name)
      .sort()
    expect(CANONICAL_UNIT_FACING).toBe('south')
    expect(nonSouth).toEqual([...LEGACY_NON_SOUTH_UNIT_SPRITES].sort())
  })

  it('keeps every layered tank part (wagon, turret, barrel) south-facing', () => {
    for (const variant of Object.keys(tankConfig)) {
      for (const part of ['wagon', 'turret', 'barrel']) {
        const facing = UNIT_SPRITE_FACING[`${variant}_${part}.webp`]
        if (facing) expect(`${variant}_${part}:${facing}`).toBe(`${variant}_${part}:south`)
      }
    }
  })

  it('maps facings to the renderer rotation offset', () => {
    expect(facingRotationOffset('south')).toBeCloseTo(-Math.PI / 2)
    expect(facingRotationOffset('north')).toBeCloseTo(Math.PI / 2)
  })

  it('mounts the light tank barrel so it extends from the front (bottom) of the turret', () => {
    const { barrelMountPoint, turretMountPoint } = tankConfig.lightTank
    // Barrel centre sits below the turret image (turret is 101 px tall) -> muzzle points south.
    expect(barrelMountPoint.y).toBeGreaterThan(101)
    // After the 180 degree correction the turret ring sits slightly forward (south) of the hull centre (236 px tall).
    expect(turretMountPoint.y).toBeGreaterThan(236 / 2)
  })
})
