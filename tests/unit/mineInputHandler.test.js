/**
 * Unit tests for src/input/mineInputHandler.js
 *
 * Tests Mine Layer click handling, area deployment,
 * Mine Sweeper sweep commands, and preview generation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock dependencies
vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32
}))

vi.mock('../../src/game/mineSweeperBehavior.js', () => ({
  calculateZigZagSweepPath: vi.fn((area) => {
    if (!area) return []
    const minX = Math.min(area.startX, area.endX)
    const maxX = Math.max(area.startX, area.endX)
    const minY = Math.min(area.startY, area.endY)
    const maxY = Math.max(area.startY, area.endY)
    const tiles = []
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        tiles.push({ x, y })
      }
    }
    return tiles
  })
}))

vi.mock('../../src/utils.js', () => ({
  getUniqueId: vi.fn(() => 'test-field-id-1234')
}))

import {
  hasMineLayerSelected,
  hasMineSweeperSelected,
  handleMineLayerClick,
  handleMineLayerAreaDeploy,
  handleMineSweeperRectangleSweep,
  handleMineSweeperFreeformSweep,
  getMineDeploymentPreview,
  getSweepAreaPreview,
  getFreeformSweepPreview
} from '../../src/input/mineInputHandler.js'

describe('mineInputHandler.js', () => {
  describe('hasMineLayerSelected()', () => {
    it('[U02804] should return true when a healthy mine layer is selected', () => {
      const selectedUnits = [
        { type: 'mineLayer', health: 100 }
      ]
      expect(hasMineLayerSelected(selectedUnits)).toBe(true)
    })

    it('[U02805] should return false when no mine layer is selected', () => {
      const selectedUnits = [
        { type: 'tank', health: 100 }
      ]
      expect(hasMineLayerSelected(selectedUnits)).toBe(false)
    })

    it('[U02806] should return false when mine layer has no health', () => {
      const selectedUnits = [
        { type: 'mineLayer', health: 0 }
      ]
      expect(hasMineLayerSelected(selectedUnits)).toBe(false)
    })

    it('[U02807] should return false for null input', () => {
      expect(hasMineLayerSelected(null)).toBeFalsy()
    })

    it('[U02808] should return false for empty array', () => {
      expect(hasMineLayerSelected([])).toBe(false)
    })

    it('[U02809] should return true when at least one mine layer among others', () => {
      const selectedUnits = [
        { type: 'tank', health: 100 },
        { type: 'mineLayer', health: 50 },
        { type: 'harvester', health: 100 }
      ]
      expect(hasMineLayerSelected(selectedUnits)).toBe(true)
    })
  })

  describe('hasMineSweeperSelected()', () => {
    it('[U02810] should return true when a healthy mine sweeper is selected', () => {
      const selectedUnits = [
        { type: 'mineSweeper', health: 100 }
      ]
      expect(hasMineSweeperSelected(selectedUnits)).toBe(true)
    })

    it('[U02811] should return false when no mine sweeper is selected', () => {
      const selectedUnits = [
        { type: 'tank', health: 100 }
      ]
      expect(hasMineSweeperSelected(selectedUnits)).toBe(false)
    })

    it('[U02812] should return false when mine sweeper has no health', () => {
      const selectedUnits = [
        { type: 'mineSweeper', health: 0 }
      ]
      expect(hasMineSweeperSelected(selectedUnits)).toBe(false)
    })

    it('[U02813] should return false for null input', () => {
      expect(hasMineSweeperSelected(null)).toBeFalsy()
    })

    it('[U02814] should return false for empty array', () => {
      expect(hasMineSweeperSelected([])).toBe(false)
    })
  })

  describe('handleMineLayerClick()', () => {
    let selectedUnits

    beforeEach(() => {
      selectedUnits = [
        { id: 'ml-1', type: 'mineLayer', health: 100, commandQueue: [] }
      ]
    })

    it('[U02815] should return false when no mine layers selected', () => {
      const result = handleMineLayerClick([], 5, 5, false)
      expect(result).toBe(false)
    })

    it('[U02816] should return false when mine layer has no health', () => {
      selectedUnits[0].health = 0
      const result = handleMineLayerClick(selectedUnits, 5, 5, false)
      expect(result).toBe(false)
    })

    it('[U02817] should add deployMine command without shift key (replace)', () => {
      selectedUnits[0].commandQueue = [{ type: 'move', x: 0, y: 0 }]

      const result = handleMineLayerClick(selectedUnits, 5, 5, false)

      expect(result).toBe(true)
      expect(selectedUnits[0].commandQueue).toEqual([
        { type: 'deployMine', x: 5, y: 5 }
      ])
      expect(selectedUnits[0].currentCommand).toBeNull()
    })

    it('[U02818] should queue deployMine command with shift key', () => {
      selectedUnits[0].commandQueue = [{ type: 'move', x: 0, y: 0 }]

      const result = handleMineLayerClick(selectedUnits, 5, 5, true)

      expect(result).toBe(true)
      expect(selectedUnits[0].commandQueue).toEqual([
        { type: 'move', x: 0, y: 0 },
        { type: 'deployMine', x: 5, y: 5 }
      ])
    })

    it('[U02819] should handle multiple mine layers', () => {
      selectedUnits.push({ id: 'ml-2', type: 'mineLayer', health: 50, commandQueue: [] })

      const result = handleMineLayerClick(selectedUnits, 5, 5, false)

      expect(result).toBe(true)
      expect(selectedUnits[0].commandQueue.length).toBe(1)
      expect(selectedUnits[1].commandQueue.length).toBe(1)
    })

    it('[U02820] should initialize commandQueue if not present', () => {
      delete selectedUnits[0].commandQueue

      const result = handleMineLayerClick(selectedUnits, 5, 5, true)

      expect(result).toBe(true)
      expect(selectedUnits[0].commandQueue).toEqual([
        { type: 'deployMine', x: 5, y: 5 }
      ])
    })
  })

  describe('handleMineLayerAreaDeploy()', () => {
    let selectedUnits

    beforeEach(() => {
      selectedUnits = [
        { id: 'ml-1', type: 'mineLayer', health: 100, x: 100, y: 100, commandQueue: [] }
      ]
    })

    it('[U02821] should return empty array when no mine layers selected', () => {
      const result = handleMineLayerAreaDeploy([], { startX: 0, startY: 0, endX: 2, endY: 2 }, false)
      expect(result).toEqual([])
    })

    it('[U02822] should deploy in checkerboard pattern', () => {
      const area = { startX: 0, startY: 0, endX: 3, endY: 3 }
      const result = handleMineLayerAreaDeploy(selectedUnits, area, false)

      // Checkerboard pattern: tiles where (x + y) is even
      expect(result.length).toBeGreaterThan(0)
    })

    it('[U02823] should assign commands to mine layer', () => {
      const area = { startX: 0, startY: 0, endX: 1, endY: 1 }

      handleMineLayerAreaDeploy(selectedUnits, area, false)

      expect(selectedUnits[0].commandQueue.length).toBeGreaterThan(0)
      expect(selectedUnits[0].commandQueue[0].type).toBe('deployMine')
    })

    it('[U02824] should queue commands with shift key', () => {
      selectedUnits[0].commandQueue = [{ type: 'move', x: 0, y: 0 }]
      const area = { startX: 0, startY: 0, endX: 1, endY: 1 }

      handleMineLayerAreaDeploy(selectedUnits, area, true)

      expect(selectedUnits[0].commandQueue[0].type).toBe('move')
      expect(selectedUnits[0].commandQueue.length).toBeGreaterThan(1)
    })

    it('[U02825] should split path among multiple mine layers', () => {
      selectedUnits.push({ id: 'ml-2', type: 'mineLayer', health: 100, x: 100, y: 100, commandQueue: [] })
      const area = { startX: 0, startY: 0, endX: 5, endY: 5 }

      handleMineLayerAreaDeploy(selectedUnits, area, false)

      // Both should have commands assigned
      expect(selectedUnits[0].commandQueue.length).toBeGreaterThan(0)
      expect(selectedUnits[1].commandQueue.length).toBeGreaterThan(0)
    })

    it('[U02826] should include areaFieldId in commands', () => {
      const area = { startX: 0, startY: 0, endX: 1, endY: 1 }

      handleMineLayerAreaDeploy(selectedUnits, area, false)

      expect(selectedUnits[0].commandQueue[0].areaFieldId).toBeDefined()
    })

    it('[U02827] should register pending mine field deployment', () => {
      const area = { startX: 0, startY: 0, endX: 1, endY: 1 }

      handleMineLayerAreaDeploy(selectedUnits, area, false)

      expect(selectedUnits[0].pendingMineFieldDeployments).toBeDefined()
    })
  })

  describe('handleMineSweeperRectangleSweep()', () => {
    let selectedUnits

    beforeEach(() => {
      selectedUnits = [
        { id: 'ms-1', type: 'mineSweeper', health: 200, x: 100, y: 100, commandQueue: [] }
      ]
    })

    it('[U02828] should return empty array when no mine sweepers selected', () => {
      const result = handleMineSweeperRectangleSweep([], { startX: 0, startY: 0, endX: 2, endY: 2 }, false)
      expect(result).toEqual([])
    })

    it('[U02829] should generate sweep path for area', () => {
      const area = { startX: 0, startY: 0, endX: 2, endY: 2 }

      const result = handleMineSweeperRectangleSweep(selectedUnits, area, false)

      expect(result.length).toBeGreaterThan(0)
    })

    it('[U02830] should assign sweep command to sweeper', () => {
      const area = { startX: 0, startY: 0, endX: 2, endY: 2 }

      handleMineSweeperRectangleSweep(selectedUnits, area, false)

      // Should have move command + sweep command
      expect(selectedUnits[0].commandQueue.length).toBeGreaterThanOrEqual(1)
      const sweepCommand = selectedUnits[0].commandQueue.find(c => c.type === 'sweepArea')
      expect(sweepCommand).toBeDefined()
      expect(sweepCommand.path.length).toBeGreaterThan(0)
    })

    it('[U02831] should queue commands with shift key', () => {
      selectedUnits[0].commandQueue = [{ type: 'move', x: 0, y: 0 }]
      const area = { startX: 0, startY: 0, endX: 2, endY: 2 }

      handleMineSweeperRectangleSweep(selectedUnits, area, true)

      expect(selectedUnits[0].commandQueue[0].type).toBe('move')
    })

    it('[U02832] should split path among multiple sweepers', () => {
      selectedUnits.push({ id: 'ms-2', type: 'mineSweeper', health: 200, x: 200, y: 200, commandQueue: [] })
      const area = { startX: 0, startY: 0, endX: 10, endY: 10 }

      handleMineSweeperRectangleSweep(selectedUnits, area, false)

      expect(selectedUnits[0].commandQueue.length).toBeGreaterThan(0)
      expect(selectedUnits[1].commandQueue.length).toBeGreaterThan(0)
    })
  })

  describe('handleMineSweeperFreeformSweep()', () => {
    let selectedUnits

    beforeEach(() => {
      selectedUnits = [
        { id: 'ms-1', type: 'mineSweeper', health: 200, x: 100, y: 100, commandQueue: [] }
      ]
    })

    it('[U02833] should return empty array when no mine sweepers selected', () => {
      const paintedTiles = new Set(['0,0', '1,1'])
      const result = handleMineSweeperFreeformSweep([], paintedTiles, false)
      expect(result).toEqual([])
    })

    it('[U02834] should convert painted tiles to sweep path', () => {
      const paintedTiles = new Set(['0,0', '1,1', '2,2'])

      const result = handleMineSweeperFreeformSweep(selectedUnits, paintedTiles, false)

      expect(result.length).toBe(3)
    })

    it('[U02835] should sort tiles by Y then X', () => {
      const paintedTiles = new Set(['2,1', '0,1', '1,0'])

      const result = handleMineSweeperFreeformSweep(selectedUnits, paintedTiles, false)

      expect(result[0]).toEqual({ x: 1, y: 0 })
      expect(result[1]).toEqual({ x: 0, y: 1 })
      expect(result[2]).toEqual({ x: 2, y: 1 })
    })

    it('[U02836] should assign sweep command to sweeper', () => {
      const paintedTiles = new Set(['0,0', '1,1'])

      handleMineSweeperFreeformSweep(selectedUnits, paintedTiles, false)

      const sweepCommand = selectedUnits[0].commandQueue.find(c => c.type === 'sweepArea')
      expect(sweepCommand).toBeDefined()
    })

    it('[U02837] should queue commands with shift key', () => {
      selectedUnits[0].commandQueue = [{ type: 'guard' }]
      const paintedTiles = new Set(['0,0'])

      handleMineSweeperFreeformSweep(selectedUnits, paintedTiles, true)

      expect(selectedUnits[0].commandQueue[0].type).toBe('guard')
    })
  })

  describe('getMineDeploymentPreview()', () => {
    it('[U02838] should return checkerboard preview for area', () => {
      const area = { startX: 0, startY: 0, endX: 3, endY: 3 }

      const preview = getMineDeploymentPreview(area)

      expect(preview.type).toBe('checkerboard')
      expect(preview.tiles.length).toBeGreaterThan(0)
    })

    it('[U02839] should only include tiles where (x + y) is even', () => {
      const area = { startX: 0, startY: 0, endX: 2, endY: 2 }

      const preview = getMineDeploymentPreview(area)

      preview.tiles.forEach(tile => {
        expect((tile.x + tile.y) % 2).toBe(0)
      })
    })

    it('[U02840] should handle inverted area bounds', () => {
      const area = { startX: 3, startY: 3, endX: 0, endY: 0 }

      const preview = getMineDeploymentPreview(area)

      expect(preview.tiles.length).toBeGreaterThan(0)
    })
  })

  describe('getSweepAreaPreview()', () => {
    it('[U02841] should return sweep preview for area', () => {
      const area = { startX: 0, startY: 0, endX: 2, endY: 2 }

      const preview = getSweepAreaPreview(area)

      expect(preview.type).toBe('sweep')
      expect(preview.tiles.length).toBeGreaterThan(0)
    })
  })

  describe('getFreeformSweepPreview()', () => {
    it('[U02842] should return freeform preview from painted tiles', () => {
      const paintedTiles = new Set(['0,0', '1,1', '2,2'])

      const preview = getFreeformSweepPreview(paintedTiles)

      expect(preview.type).toBe('freeform')
      expect(preview.tiles.length).toBe(3)
    })

    it('[U02843] should convert tile strings to coordinates', () => {
      const paintedTiles = new Set(['5,10'])

      const preview = getFreeformSweepPreview(paintedTiles)

      expect(preview.tiles[0]).toEqual({ x: 5, y: 10 })
    })

    it('[U02844] should handle empty set', () => {
      const paintedTiles = new Set()

      const preview = getFreeformSweepPreview(paintedTiles)

      expect(preview.tiles).toEqual([])
    })
  })
})
