import { describe, it, expect, beforeEach, vi } from 'vitest'
import { updateAIUnit } from '../../src/ai/enemyUnitBehavior.js'
import { AI_DECISION_INTERVAL, TILE_SIZE } from '../../src/config.js'
import { getCachedPath } from '../../src/game/pathfinding.js'
import { applyEnemyStrategies } from '../../src/ai/enemyStrategies.js'

vi.mock('../../src/units.js', () => ({
  findPath: vi.fn(() => [{ x: 0, y: 0 }, { x: 1, y: 1 }])
}))

vi.mock('../../src/game/pathfinding.js', () => ({
  getCachedPath: vi.fn(() => [{ x: 0, y: 0 }, { x: 1, y: 1 }])
}))

vi.mock('../../src/ai/enemyStrategies.js', () => ({
  applyEnemyStrategies: vi.fn(),
  shouldConductGroupAttack: vi.fn(() => false),
  shouldRetreatLowHealth: vi.fn(() => false),
  shouldAIStartAttacking: vi.fn(() => false)
}))

vi.mock('../../src/ai/enemyUtils.js', () => ({
  isEnemyTo: vi.fn(() => true)
}))

vi.mock('../../src/buildings.js', () => ({
  buildingData: { rocketTurret: { fireRange: 16 } }
}))

const createMapGrid = (width = 20, height = 20) =>
  Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: 'grass' }))
  )

const createGameState = (overrides = {}) => ({
  humanPlayer: 'player',
  buildings: [],
  occupancyMap: { get: () => null },
  ...overrides
})

const createBaseUnit = (overrides = {}) => ({
  id: 'unit-1',
  owner: 'ai',
  type: 'tank',
  health: 100,
  x: 0,
  y: 0,
  tileX: 0,
  tileY: 0,
  path: [],
  ...overrides
})

describe('enemyUnitBehavior updateAIUnit', () => {
  let mapGrid
  let gameState
  let now

  beforeEach(() => {
    mapGrid = createMapGrid()
    gameState = createGameState()
    now = 10000
    vi.clearAllMocks()
  })

  it('resets attack flags after cooldown and returns early for workshop repair', () => {
    const unit = createBaseUnit({
      isBeingAttacked: true,
      lastDamageTime: now - 6000,
      lastAttacker: { id: 'attacker', health: 100 },
      returningToWorkshop: true
    })

    updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])

    expect(unit.isBeingAttacked).toBe(false)
    expect(unit.lastAttacker).toBeNull()
  })

  it('clears invalid attacker references when attacker is destroyed', () => {
    const unit = createBaseUnit({
      isBeingAttacked: true,
      lastDamageTime: now - 4000,
      lastAttacker: { id: 'attacker', health: 0 },
      returningToWorkshop: true
    })

    updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])

    expect(unit.lastAttacker).toBeNull()
    expect(unit.isBeingAttacked).toBe(false)
  })

  it('keeps disabled crew units in place while firing defensively', () => {
    const attacker = { id: 'attacker', health: 100, x: 32, y: 32, tileX: 1, tileY: 1 }
    const unit = createBaseUnit({
      crew: { driver: false, commander: true, gunner: true },
      isBeingAttacked: true,
      lastAttacker: attacker,
      path: [{ x: 2, y: 2 }],
      moveTarget: { x: 64, y: 64 }
    })

    updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])

    expect(unit.target).toBe(attacker)
    expect(unit.moveTarget).toBeNull()
    expect(unit.path).toEqual([])
  })

  it('clears hospital return flags when crew is restored near the hospital', () => {
    const unit = createBaseUnit({
      crew: { driver: true, commander: true, gunner: true },
      returningToHospital: true,
      hospitalTarget: { id: 'hospital-1' },
      needsHospital: true,
      moveTarget: { x: TILE_SIZE, y: TILE_SIZE }
    })

    updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])

    expect(unit.returningToHospital).toBe(false)
    expect(unit.hospitalTarget).toBeNull()
    expect(unit.needsHospital).toBe(false)
    expect(unit.moveTarget).toBeNull()
    expect(unit.path).toEqual([])
  })

  it('routes ambulances to hospitals when crew needs refilling', () => {
    const hospital = { id: 'hospital-1', type: 'hospital', owner: 'ai', health: 100, x: 5, y: 5, width: 2, height: 2 }
    gameState.buildings = [hospital]

    const unit = createBaseUnit({
      type: 'ambulance',
      crew: 2,
      tileX: 2,
      tileY: 2
    })

    updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])

    expect(unit.refillingTarget).toBe(hospital)
    expect(getCachedPath).toHaveBeenCalled()
    expect(unit.moveTarget).toEqual({
      x: (hospital.x + Math.floor(hospital.width / 2)) * TILE_SIZE,
      y: (hospital.y + hospital.height + 1) * TILE_SIZE
    })
  })

  it('assigns ambulances to heal nearby immobile units', () => {
    const immobileTank = {
      id: 'ally-1',
      owner: 'ai',
      type: 'tank',
      health: 100,
      x: TILE_SIZE * 2,
      y: TILE_SIZE * 2,
      crew: { driver: false, commander: true, gunner: true }
    }

    const unit = createBaseUnit({
      type: 'ambulance',
      crew: 4,
      x: 0,
      y: 0
    })

    updateAIUnit(unit, [unit, immobileTank], gameState, mapGrid, now, 'ai', [], [])

    expect(unit.healingTarget).toBe(immobileTank)
    expect(unit.healingTimer).toBe(0)
    expect(unit.moveTarget).toBeNull()
  })

  it('targets nearby enemy tanks when harvester hunters are threatened', () => {
    const threatTank = {
      id: 'enemy-1',
      owner: 'player',
      type: 'tank',
      health: 100,
      x: TILE_SIZE * 2,
      y: TILE_SIZE * 2
    }

    const unit = createBaseUnit({
      harvesterHunter: true,
      holdInFactory: true,
      spawnedInFactory: true,
      path: [{ x: 1, y: 1 }]
    })

    updateAIUnit(unit, [unit, threatTank], gameState, mapGrid, now, 'ai', [], [])

    expect(unit.holdInFactory).toBe(false)
    expect(unit.spawnedInFactory).toBe(false)
    expect(unit.target).toBe(threatTank)
    expect(unit.allowedToAttack).toBe(true)
    expect(unit.path).toEqual([])
    expect(unit.moveTarget).toBeNull()
    expect(unit.lastDecisionTime).toBe(now)
  })

  it('defends the base by targeting nearby player units', () => {
    const aiBuilding = { id: 'base', owner: 'ai', health: 100, x: 5, y: 5, width: 2, height: 2 }
    const playerUnit = {
      id: 'raider',
      owner: 'player',
      type: 'tank',
      health: 100,
      x: (aiBuilding.x + 1) * TILE_SIZE,
      y: (aiBuilding.y + 1) * TILE_SIZE,
      tileX: aiBuilding.x + 1,
      tileY: aiBuilding.y + 1
    }

    gameState.buildings = [aiBuilding]

    const unit = createBaseUnit({
      x: (aiBuilding.x + 1) * TILE_SIZE,
      y: (aiBuilding.y + 1) * TILE_SIZE,
      tileX: aiBuilding.x + 1,
      tileY: aiBuilding.y + 1
    })

    updateAIUnit(unit, [unit, playerUnit], gameState, mapGrid, now, 'ai', [], [])

    expect(applyEnemyStrategies).toHaveBeenCalled()
    expect(unit.defendingBase).toBe(true)
    expect(unit.target).toBe(playerUnit)
    expect(unit.lastTargetChangeTime).toBe(now)
    expect(getCachedPath).toHaveBeenCalled()
    expect(unit.path.length).toBeGreaterThan(0)
  })

  it('retreats apaches when air defenses are nearby', () => {
    const rocketTank = {
      id: 'rocket-1',
      owner: 'player',
      type: 'rocketTank',
      health: 100,
      x: 0,
      y: 0
    }

    gameState.buildings = [
      { id: 'ai-base', owner: 'ai', health: 100, x: 3, y: 3, width: 2, height: 2 }
    ]

    const unit = createBaseUnit({
      type: 'apache',
      tileX: 1,
      tileY: 1,
      x: TILE_SIZE,
      y: TILE_SIZE
    })

    updateAIUnit(unit, [unit, rocketTank], gameState, mapGrid, now, 'ai', [], [])

    // Apache should retreat to safety, using flightPlan instead of pathfinding
    expect(unit.airDefenseRetreating).toBe(true)
    expect(unit.target).toBeNull()
    expect(unit.flightPlan).toBeDefined()
    expect(unit.flightPlan.mode).toBe('retreat')
    expect(unit.flightPlan.x).toBeDefined()
    expect(unit.flightPlan.y).toBeDefined()
  })

  it('honors decision intervals before re-evaluating apache targets', () => {
    const unit = createBaseUnit({
      type: 'apache',
      lastDecisionTime: now - AI_DECISION_INTERVAL + 100
    })

    updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])

    expect(unit.target).toBeUndefined()
    expect(unit.moveTarget).toBeUndefined()
    expect(unit.path).toEqual([])
  })

  it('clears target when target is destroyed', () => {
    const destroyedEnemy = {
      id: 'enemy-1',
      owner: 'player',
      health: 0 // destroyed
    }

    const unit = createBaseUnit({
      target: destroyedEnemy,
      path: [{ x: 5, y: 5 }]
    })

    updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])

    // Target should be cleared when destroyed
    expect(unit.target).toBeNull()
    // Path may or may not be cleared depending on AI logic
  })

  it('clears target when target is neutralized', () => {
    const neutralizedEnemy = {
      id: 'enemy-1',
      owner: 'neutral',
      health: 100
    }

    const unit = createBaseUnit({
      target: neutralizedEnemy
    })

    updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])

    expect(unit.target).toBeNull()
  })

  it('does not update AI for neutral units', () => {
    const unit = createBaseUnit({
      owner: 'neutral',
      path: [{ x: 1, y: 1 }]
    })

    const originalPath = [...unit.path]

    updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])

    // Path should remain unchanged for neutral units
    expect(unit.path).toEqual(originalPath)
  })

  it('handles units without lastDecisionTime', () => {
    const unit = createBaseUnit({
      lastDecisionTime: undefined
    })

    expect(() => {
      updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])
    }).not.toThrow()
  })

  it('respects AI decision interval timing', () => {
    const unit = createBaseUnit({
      lastDecisionTime: now, // Just made a decision
      path: []
    })

    updateAIUnit(unit, [unit], gameState, mapGrid, now + 100, 'ai', [], [])

    // Should not make new decisions within the interval
    expect(unit.lastDecisionTime).toBe(now) // Unchanged
  })

  it('handles harvester units without special behavior', () => {
    const unit = createBaseUnit({
      type: 'harvester',
      path: [],
      harvesting: false
    })

    expect(() => {
      updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])
    }).not.toThrow()
  })

  it('sets target when being attacked and enemy is in range', () => {
    const attacker = {
      id: 'attacker',
      owner: 'player',
      type: 'tank',
      health: 100,
      x: TILE_SIZE * 2,
      y: TILE_SIZE * 2,
      tileX: 2,
      tileY: 2
    }

    const unit = createBaseUnit({
      isBeingAttacked: true,
      lastDamageTime: now - 1000,
      lastAttacker: attacker,
      x: 0,
      y: 0,
      tileX: 0,
      tileY: 0
    })

    updateAIUnit(unit, [unit, attacker], gameState, mapGrid, now, 'ai', [], [])

    expect(unit.target).toBe(attacker)
  })

  it('handles ambulance with fully healed target', () => {
    const healedUnit = {
      id: 'ally-1',
      owner: 'ai',
      type: 'tank',
      health: 100,
      crew: { driver: true, commander: true, gunner: true },
      x: TILE_SIZE * 2,
      y: TILE_SIZE * 2
    }

    const unit = createBaseUnit({
      type: 'ambulance',
      crew: 4,
      healingTarget: healedUnit,
      x: TILE_SIZE * 2,
      y: TILE_SIZE * 2
    })

    // Should not throw when processing ambulance with healthy target
    expect(() => {
      updateAIUnit(unit, [unit, healedUnit], gameState, mapGrid, now, 'ai', [], [])
    }).not.toThrow()
  })

  it('keeps apaches engaged when no air defenses nearby', () => {
    const groundUnit = {
      id: 'ground-1',
      owner: 'player',
      type: 'tank', // Not air defense
      health: 100,
      x: TILE_SIZE * 3,
      y: TILE_SIZE * 3
    }

    gameState.buildings = []

    const unit = createBaseUnit({
      type: 'apache',
      tileX: 1,
      tileY: 1,
      target: null,
      airDefenseRetreating: false,
      lastDecisionTime: now - AI_DECISION_INTERVAL - 1000
    })

    // Should not throw when processing apache without air defenses
    expect(() => {
      updateAIUnit(unit, [unit, groundUnit], gameState, mapGrid, now, 'ai', [], [])
    }).not.toThrow()
  })


  it('makes enemy f35 prefer defense-less buildings outside anti-air coverage', () => {
    mapGrid = createMapGrid(40, 40)

    const guardedBuilding = {
      id: 'guarded-refinery',
      owner: 'player',
      type: 'oreRefinery',
      health: 100,
      x: 5,
      y: 5,
      width: 2,
      height: 2
    }
    const safeBuilding = {
      id: 'safe-power',
      owner: 'player',
      type: 'powerPlant',
      health: 100,
      x: 30,
      y: 30,
      width: 2,
      height: 2
    }
    const antiAirTurret = {
      id: 'aa-turret',
      owner: 'player',
      type: 'rocketTurret',
      health: 100,
      x: guardedBuilding.x,
      y: guardedBuilding.y,
      width: 1,
      height: 1
    }

    gameState.buildings = [guardedBuilding, safeBuilding, antiAirTurret]

    const unit = createBaseUnit({
      type: 'f35',
      x: 28 * TILE_SIZE,
      y: 28 * TILE_SIZE,
      tileX: 28,
      tileY: 28,
      flightState: 'airborne',
      altitude: 120,
      canFire: true,
      maxAltitude: 120,
      rocketAmmo: 6,
      lastDecisionTime: now - AI_DECISION_INTERVAL - 1000
    })

    updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])

    expect(unit.target).toBe(safeBuilding)
    expect(unit.allowedToAttack).toBe(true)
  })

  it('prioritizes base defense over other behaviors', () => {
    const aiBuilding = { id: 'ai-factory', owner: 'ai', health: 100, x: 5, y: 5, width: 2, height: 2 }
    const playerThreat = {
      id: 'raider',
      owner: 'player',
      type: 'tank',
      health: 100,
      x: (aiBuilding.x + 2) * TILE_SIZE,
      y: (aiBuilding.y + 2) * TILE_SIZE,
      tileX: aiBuilding.x + 2,
      tileY: aiBuilding.y + 2
    }

    gameState.buildings = [aiBuilding]

    const unit = createBaseUnit({
      x: (aiBuilding.x) * TILE_SIZE,
      y: (aiBuilding.y) * TILE_SIZE,
      tileX: aiBuilding.x,
      tileY: aiBuilding.y,
      defendingBase: false,
      lastDecisionTime: now - AI_DECISION_INTERVAL - 1000
    })

    updateAIUnit(unit, [unit, playerThreat], gameState, mapGrid, now, 'ai', [], [])

    expect(unit.defendingBase).toBe(true)
  })

  it('handles factory holding state for spawned units', () => {
    const unit = createBaseUnit({
      holdInFactory: true,
      spawnedInFactory: true,
      harvesterHunter: false,
      path: []
    })

    updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])

    // Unit should remain in hold state if not a harvester hunter
    expect(unit.holdInFactory).toBe(true)
  })

  it('clears invalid move targets', () => {
    const unit = createBaseUnit({
      moveTarget: { x: NaN, y: NaN },
      path: []
    })

    updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])

    // Should handle invalid move targets gracefully
    expect(unit.path).toEqual([])
  })

  it('handles units at map boundaries', () => {
    const unit = createBaseUnit({
      x: 0,
      y: 0,
      tileX: 0,
      tileY: 0
    })

    expect(() => {
      updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])
    }).not.toThrow()
  })

  it('handles units at far map edge', () => {
    const unit = createBaseUnit({
      x: 19 * TILE_SIZE,
      y: 19 * TILE_SIZE,
      tileX: 19,
      tileY: 19
    })

    expect(() => {
      updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])
    }).not.toThrow()
  })
})
