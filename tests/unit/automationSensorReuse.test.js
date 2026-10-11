import { describe, expect, it } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
import { beginUnitScope, getScopeEnemy, isUnitScopeCurrent } from '../../src/policies/policySensors.js'
import { findNearestEnemy } from '../../src/policies/policyWorld.js'
import { executeUnitCommand } from '../../src/policies/unitCommandApi.js'

const unit = id => ({ id, type: 'tank', owner: 'player1', health: 100, x: 32, y: 32, tileX: 1, tileY: 1 })

describe('automation sensing reuse', () => {
  it('shares a negative enemy result through command validation and issuance, and invalidates at the next entity scope', () => {
    const controlled = unit('controlled')
    let reads = 0
    const friendly = { ...unit('friend'), get health() { reads++; return 100 } }
    const ctx = { units: [friendly], getFireRange: () => TILE_SIZE * 10 }
    beginUnitScope(controlled, ctx, 0)
    expect(getScopeEnemy()).toBeNull()
    const firstReads = reads
    expect(executeUnitCommand('autoAttackInRange', controlled, {}, ctx)).toBe(false)
    expect(getScopeEnemy()).toBeNull()
    expect(reads).toBe(firstReads)
    expect(isUnitScopeCurrent(unit('other'), ctx)).toBe(false)
    beginUnitScope(controlled, ctx, 150)
    expect(getScopeEnemy()).toBeNull()
    expect(reads).toBeGreaterThan(firstReads)
  })
  it('breaks equal-distance ties by stable ID regardless of candidate order', () => {
    const controlled = unit('controlled')
    const a = { ...unit('a'), owner: 'player2', x: 64 }
    const b = { ...unit('b'), owner: 'player2', x: 0 }
    expect(findNearestEnemy(controlled, [a, b])).toBe(a)
    expect(findNearestEnemy(controlled, [b, a])).toBe(a)
  })
})
