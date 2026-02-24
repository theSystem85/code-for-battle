import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/main.js', () => ({
  factories: [],
  units: [],
  bullets: [],
  mapGrid: [],
  getCurrentGame: vi.fn()
}))

import { handleFallbackCommand } from '../../src/input/mouseCommands.js'
import { gameState } from '../../src/gameState.js'
import { TILE_SIZE } from '../../src/config.js'

describe('mouseCommands fallback defense-building targeting', () => {
  beforeEach(() => {
    gameState.humanPlayer = 'player1'
    gameState.buildingPlacementMode = false
    gameState.repairMode = false
    gameState.sellMode = false
  })

  it('queues normal-click enemy target for selected defense buildings and prepends new entry', () => {
    const existingQueuedTarget = { id: 'enemy-old', owner: 'enemy', health: 100, x: 0, y: 0 }
    const activeTarget = { id: 'enemy-active', owner: 'enemy', health: 100, x: 0, y: 0 }
    const clickedEnemy = {
      id: 'enemy-clicked',
      owner: 'enemy',
      health: 100,
      x: 10 * TILE_SIZE,
      y: 6 * TILE_SIZE
    }

    const selectedTurret = {
      id: 'turret-1',
      type: 'rocketTurret',
      owner: 'player1',
      isBuilding: true,
      forcedAttackTarget: activeTarget,
      forcedAttackQueue: [existingQueuedTarget],
      holdFire: true,
      forcedAttack: false
    }

    const handler = {
      selectionManager: {
        isCommandableUnit: vi.fn().mockReturnValue(true)
      }
    }

    const unitCommands = {}
    const mapGrid = []
    const e = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }

    handleFallbackCommand(
      handler,
      clickedEnemy.x + TILE_SIZE / 2,
      clickedEnemy.y + TILE_SIZE / 2,
      [selectedTurret],
      unitCommands,
      mapGrid,
      e,
      [clickedEnemy],
      []
    )

    expect(selectedTurret.forcedAttackTarget).toBe(clickedEnemy)
    expect(selectedTurret.forcedAttackQueue.map(target => target.id)).toEqual(['enemy-active', 'enemy-old'])
    expect(selectedTurret.holdFire).toBe(false)
    expect(selectedTurret.forcedAttack).toBe(true)
  })
})
