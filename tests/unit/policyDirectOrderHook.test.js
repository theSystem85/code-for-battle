import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/behaviours/retreat.js', () => ({ cancelRetreatForUnits: vi.fn() }))
vi.mock('../../src/main.js', () => ({ units: [] }))
vi.mock('../../src/utils.js', () => ({ getBuildingIdentifier: vi.fn(() => 'building-id') }))
vi.mock('../../src/game/tankerTruckUtils.js', () => ({
  computeTankerKamikazeApproach: vi.fn(),
  clearTankerKamikazeState: vi.fn(),
  updateKamikazeTargetPoint: vi.fn()
}))
vi.mock('../../src/units.js', () => ({
  findPathForOwner: vi.fn(() => [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])
}))
vi.mock('../../src/sound.js', () => ({ playSound: vi.fn(), playPositionalSound: vi.fn() }))
vi.mock('../../src/ui/notifications.js', () => ({ showNotification: vi.fn() }))
vi.mock('../../src/network/gameCommandSync.js', () => ({
  broadcastUnitMove: vi.fn(),
  broadcastUnitAttack: vi.fn()
}))
vi.mock('../../src/game/unifiedMovement.js', () => ({ resetUnitVelocityForNewPath: vi.fn() }))
vi.mock('../../src/game/harvesterLogic.js', () => ({
  forceHarvesterUnloadPriority: vi.fn(),
  interruptHarvesterAutomation: vi.fn()
}))

import { UnitCommandsHandler } from '../../src/input/unitCommands.js'
import { runAsPolicy } from '../../src/policies/policyEngine.js'

function grid() {
  return Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => ({ type: 'grass' })))
}

describe('direct orders reach the policy engine through the real command handler', () => {
  let handler
  let unit
  let enemy

  beforeEach(() => {
    handler = new UnitCommandsHandler()
    unit = { id: 'u1', type: 'tank_v1', owner: 'player1', x: 0, y: 0, tileX: 0, tileY: 0, health: 100, maxHealth: 100 }
    enemy = { id: 'e1', owner: 'player2', x: 160, y: 160, tileX: 5, tileY: 5, health: 100 }
  })

  it('records a move order and the attack target', () => {
    handler.handleMovementCommand([unit], 96, 96, grid())
    expect(unit.policyControl.order).toMatchObject({ active: true })

    handler.handleAttackCommand([unit], enemy, grid(), false)
    expect(unit.policyControl.order.targetRef).toBe(enemy)
    expect(unit.policyControl.dominant.kind).toBe('order')
  })

  it('does not record orders issued by a policy', () => {
    runAsPolicy(() => handler.handleMovementCommand([unit], 96, 96, grid()))
    expect(unit.policyControl).toBeUndefined()
  })
})
