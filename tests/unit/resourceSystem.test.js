/**
 * Tests for Resource & Economy System
 *
 * Tests money tracking, power supply/consumption calculations,
 * build speed modifiers, and related economy mechanics.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { buildingData } from '../../src/data/buildingData.js'

// Mock modules to avoid import issues
vi.mock('../../src/game/dangerZoneMap.js', () => ({
  updateDangerZoneMaps: vi.fn()
}))

vi.mock('../../src/rendering.js', () => ({
  getMapRenderer: () => null
}))

vi.mock('../../src/buildingImageMap.js', () => ({
  getBuildingImage: vi.fn(() => null)
}))

vi.mock('../../src/benchmark/benchmarkRunner.js', () => ({
  default: {}
}))

vi.mock('../../src/benchmark/benchmarkScenario.js', () => ({
  createBenchmarkScenario: vi.fn()
}))

// Import after mocking
import { updatePowerSupply, calculateRepairCost } from '../../src/buildings.js'

describe('Resource & Economy System', () => {
  beforeEach(() => {
    // Reset game state
    gameState.money = 12000
    gameState.totalMoneyEarned = 0
    gameState.humanPlayer = 'player'
    gameState.buildings = []
    gameState.factories = []
    gameState.units = []
    gameState.playerPowerSupply = 0
    gameState.playerTotalPowerProduction = 0
    gameState.playerPowerConsumption = 0
    gameState.enemyPowerSupply = 0
    gameState.enemyTotalPowerProduction = 0
    gameState.enemyPowerConsumption = 0
    gameState.playerBuildSpeedModifier = 1.0
    gameState.enemyBuildSpeedModifier = 1.0
    gameState.lowEnergyMode = false
    gameState.radarActive = false
    gameState.powerSupply = 0
    gameState.totalPowerProduction = 0
    gameState.powerConsumption = 0
  })

  describe('Money Tracking', () => {
    it('[U03756] should initialize with correct starting money', () => {
      expect(gameState.money).toBe(12000)
    })

    it('[U03757] should track money additions correctly', () => {
      gameState.money += 5000
      expect(gameState.money).toBe(17000)
    })

    it('[U03758] should track money deductions correctly', () => {
      gameState.money -= 3000
      expect(gameState.money).toBe(9000)
    })

    it('[U03759] should allow money to go negative', () => {
      gameState.money -= 15000
      expect(gameState.money).toBe(-3000)
    })

    it('[U03760] should track total money earned separately', () => {
      gameState.totalMoneyEarned = 0
      const earned = 8000
      gameState.money += earned
      gameState.totalMoneyEarned += earned
      expect(gameState.totalMoneyEarned).toBe(8000)
      expect(gameState.money).toBe(20000)
    })

    it('[U03761] should maintain accurate money after multiple transactions', () => {
      gameState.money += 1000  // 13000
      gameState.money -= 500   // 12500
      gameState.money += 2500  // 15000
      gameState.money -= 4000  // 11000
      expect(gameState.money).toBe(11000)
    })
  })

  describe('Power Supply Calculation', () => {
    it('[U03762] should return 0 power with no buildings or factories', () => {
      const result = updatePowerSupply([], gameState)
      expect(result).toBe(0)
      expect(gameState.playerPowerSupply).toBe(0)
    })

    it('[U03763] should add construction yard power (+50) from factories', () => {
      gameState.factories = [{
        owner: 'player',
        health: 100,
        type: 'constructionYard'
      }]
      const result = updatePowerSupply([], gameState)
      expect(result).toBe(buildingData.constructionYard.power)
      expect(gameState.playerTotalPowerProduction).toBe(buildingData.constructionYard.power)
    })

    it('[U03764] should not count dead construction yards', () => {
      gameState.factories = [{
        owner: 'player',
        health: 0,
        type: 'constructionYard'
      }]
      const result = updatePowerSupply([], gameState)
      expect(result).toBe(0)
    })

    it('[U03765] should add power from power plants', () => {
      const powerPlant = {
        owner: 'player',
        type: 'powerPlant',
        power: buildingData.powerPlant.power,
        health: 100
      }
      const result = updatePowerSupply([powerPlant], gameState)
      expect(result).toBe(buildingData.powerPlant.power)
      expect(gameState.playerTotalPowerProduction).toBe(buildingData.powerPlant.power)
    })

    it('[U03766] should subtract power for consuming buildings', () => {
      // Ore refinery consumes power (-150)
      const refinery = {
        owner: 'player',
        type: 'oreRefinery',
        power: buildingData.oreRefinery.power,
        health: 100
      }
      const result = updatePowerSupply([refinery], gameState)
      expect(result).toBe(buildingData.oreRefinery.power) // Should be negative
      expect(gameState.playerPowerConsumption).toBe(Math.abs(buildingData.oreRefinery.power))
    })

    it('[U03767] should calculate net power correctly with mixed buildings', () => {
      gameState.factories = [{
        owner: 'player',
        health: 100,
        type: 'constructionYard'
      }]
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: buildingData.powerPlant.power, health: 100 },
        { owner: 'player', type: 'oreRefinery', power: buildingData.oreRefinery.power, health: 100 }
      ]

      const result = updatePowerSupply(buildings, gameState)

      const expectedPower = buildingData.constructionYard.power +
                           buildingData.powerPlant.power +
                           buildingData.oreRefinery.power
      expect(result).toBe(expectedPower)
    })

    it('[U03768] should track production and consumption separately', () => {
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: 200, health: 100 },
        { owner: 'player', type: 'oreRefinery', power: -150, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.playerTotalPowerProduction).toBe(200)
      expect(gameState.playerPowerConsumption).toBe(150)
      expect(gameState.playerPowerSupply).toBe(50)
    })

    it('[U03769] should skip buildings with no owner', () => {
      const buildings = [
        { type: 'powerPlant', power: 200, health: 100 }, // No owner
        { owner: 'player', type: 'powerPlant', power: 200, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.playerTotalPowerProduction).toBe(200)
    })
  })

  describe('Enemy Power Tracking', () => {
    it('[U03770] should track enemy power separately from player', () => {
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: 200, health: 100 },
        { owner: 'enemy', type: 'powerPlant', power: 300, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.playerPowerSupply).toBe(200)
      expect(gameState.enemyPowerSupply).toBe(300)
    })

    it('[U03771] should track enemy production and consumption', () => {
      const buildings = [
        { owner: 'enemy', type: 'powerPlant', power: 200, health: 100 },
        { owner: 'enemy', type: 'oreRefinery', power: -150, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.enemyTotalPowerProduction).toBe(200)
      expect(gameState.enemyPowerConsumption).toBe(150)
      expect(gameState.enemyPowerSupply).toBe(50)
    })

    it('[U03772] should add enemy construction yard power', () => {
      gameState.factories = [{
        owner: 'enemy',
        health: 100,
        type: 'constructionYard'
      }]
      updatePowerSupply([], gameState)

      expect(gameState.enemyTotalPowerProduction).toBe(buildingData.constructionYard.power)
    })
  })

  describe('Build Speed Modifier', () => {
    it('[U03773] should set normal build speed (1.0) when power is positive', () => {
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: 200, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.playerBuildSpeedModifier).toBe(1.0)
    })

    it('[U03774] should calculate reduced build speed when power is negative', () => {
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: 100, health: 100 },
        { owner: 'player', type: 'oreRefinery', power: -150, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      // Power = 100 - 150 = -50
      // Production = 100, Consumption = 150
      // Modifier = production / consumption = 100/150 = 0.666...
      expect(gameState.playerBuildSpeedModifier).toBeCloseTo(100 / 150, 2)
    })

    it('[U03775] should set modifier to 0 when consumption is 0 but power is negative', () => {
      // Edge case - shouldn't normally happen
      gameState.playerPowerSupply = -50
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: -50, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      // When production but no consumption tracked as positive (unusual case)
      // The power being negative with 0 consumption triggers the guard
      expect(gameState.playerBuildSpeedModifier).toBe(0)
    })

    it('[U03776] should calculate enemy build speed modifier correctly', () => {
      const buildings = [
        { owner: 'enemy', type: 'powerPlant', power: 100, health: 100 },
        { owner: 'enemy', type: 'oreRefinery', power: -200, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      // Enemy power = -100, modifier = 100/200 = 0.5
      expect(gameState.enemyBuildSpeedModifier).toBeCloseTo(0.5, 2)
    })

    it('[U03777] should set enemy build speed to 1.0 when power is positive', () => {
      const buildings = [
        { owner: 'enemy', type: 'powerPlant', power: 200, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.enemyBuildSpeedModifier).toBe(1.0)
    })
  })

  describe('Low Energy Mode', () => {
    it('[U03778] should enable low energy mode when power is negative', () => {
      const buildings = [
        { owner: 'player', type: 'oreRefinery', power: -150, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.lowEnergyMode).toBe(true)
    })

    it('[U03779] should disable low energy mode when power is positive', () => {
      gameState.lowEnergyMode = true // Start with it enabled
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: 200, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.lowEnergyMode).toBe(false)
    })

    it('[U03780] should disable low energy mode when power is exactly 0', () => {
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: 150, health: 100 },
        { owner: 'player', type: 'oreRefinery', power: -150, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.lowEnergyMode).toBe(false)
    })
  })

  describe('Radar Station', () => {
    it('[U03781] should activate radar when player has radar station and positive power', () => {
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: 200, health: 100 },
        { owner: 'player', type: 'radarStation', power: -50, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.radarActive).toBe(true)
    })

    it('[U03782] should deactivate radar when power is negative', () => {
      const buildings = [
        { owner: 'player', type: 'radarStation', power: -50, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.radarActive).toBe(false)
    })

    it('[U03783] should deactivate radar when radar station health is 0', () => {
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: 200, health: 100 },
        { owner: 'player', type: 'radarStation', power: -50, health: 0 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.radarActive).toBe(false)
    })

    it('[U03784] should deactivate radar when no radar station exists', () => {
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: 200, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.radarActive).toBe(false)
    })
  })

  describe('Backward Compatibility Fields', () => {
    it('[U03785] should update legacy power supply field', () => {
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: 200, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.powerSupply).toBe(200)
    })

    it('[U03786] should update legacy production and consumption fields', () => {
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: 200, health: 100 },
        { owner: 'player', type: 'oreRefinery', power: -150, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      expect(gameState.totalPowerProduction).toBe(200)
      expect(gameState.powerConsumption).toBe(150)
    })
  })

  describe('Building Repair Cost Calculation', () => {
    it('[U03787] should return 0 for undamaged building', () => {
      const building = {
        type: 'powerPlant',
        health: buildingData.powerPlant.health,
        maxHealth: buildingData.powerPlant.health
      }
      const cost = calculateRepairCost(building)
      expect(cost).toBe(0)
    })

    it('[U03788] should calculate repair cost based on damage percentage', () => {
      const building = {
        type: 'powerPlant',
        health: buildingData.powerPlant.health * 0.5, // 50% health
        maxHealth: buildingData.powerPlant.health
      }
      const cost = calculateRepairCost(building)

      // Repair cost = damage% * original cost * 0.3
      const expected = Math.ceil(0.5 * buildingData.powerPlant.cost * 0.3)
      expect(cost).toBe(expected)
    })

    it('[U03789] should calculate max repair cost for fully damaged building', () => {
      const building = {
        type: 'powerPlant',
        health: 0,
        maxHealth: buildingData.powerPlant.health
      }
      const cost = calculateRepairCost(building)

      // Full damage = 100% = 1.0 * cost * 0.3
      const expected = Math.ceil(1.0 * buildingData.powerPlant.cost * 0.3)
      expect(cost).toBe(expected)
    })

    it('[U03790] should calculate proportional repair cost for partial damage', () => {
      const building = {
        type: 'oreRefinery',
        health: buildingData.oreRefinery.health * 0.75, // 75% health = 25% damage
        maxHealth: buildingData.oreRefinery.health
      }
      const cost = calculateRepairCost(building)

      const expected = Math.ceil(0.25 * buildingData.oreRefinery.cost * 0.3)
      expect(cost).toBe(expected)
    })

    it('[U03791] should handle different building types correctly', () => {
      const cheapBuilding = {
        type: 'powerPlant',
        health: 50,
        maxHealth: 100
      }
      const expensiveBuilding = {
        type: 'vehicleFactory',
        health: buildingData.vehicleFactory.health * 0.5,
        maxHealth: buildingData.vehicleFactory.health
      }

      const cheapCost = calculateRepairCost(cheapBuilding)
      const expensiveCost = calculateRepairCost(expensiveBuilding)

      // Vehicle factory costs more, so repair should cost more
      expect(expensiveCost).toBeGreaterThan(cheapCost)
    })
  })

  describe('Multiple Player Power Isolation', () => {
    it('[U03792] should not mix player and enemy power', () => {
      gameState.factories = [
        { owner: 'player', health: 100, type: 'constructionYard' },
        { owner: 'enemy', health: 100, type: 'constructionYard' }
      ]
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: 200, health: 100 },
        { owner: 'enemy', type: 'powerPlant', power: 300, health: 100 },
        { owner: 'player', type: 'oreRefinery', power: -100, health: 100 }
      ]

      updatePowerSupply(buildings, gameState)

      // Player: 50 (yard) + 200 (plant) - 100 (refinery) = 150
      expect(gameState.playerPowerSupply).toBe(150)
      // Enemy: 50 (yard) + 300 (plant) = 350
      expect(gameState.enemyPowerSupply).toBe(350)
    })

    it('[U03793] should handle multiple enemy players as single enemy', () => {
      const buildings = [
        { owner: 'enemy1', type: 'powerPlant', power: 100, health: 100 },
        { owner: 'enemy2', type: 'powerPlant', power: 150, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)

      // Both enemies should be aggregated
      expect(gameState.enemyPowerSupply).toBe(250)
    })
  })

  describe('Edge Cases', () => {
    it('[U03794] should handle empty buildings array', () => {
      const result = updatePowerSupply([], gameState)
      expect(result).toBe(0)
    })

    it('[U03795] should handle null factories array', () => {
      gameState.factories = null
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: 200, health: 100 }
      ]
      const result = updatePowerSupply(buildings, gameState)
      expect(result).toBe(200)
    })

    it('[U03796] should handle undefined factories array', () => {
      gameState.factories = undefined
      const buildings = [
        { owner: 'player', type: 'powerPlant', power: 200, health: 100 }
      ]
      const result = updatePowerSupply(buildings, gameState)
      expect(result).toBe(200)
    })

    it('[U03797] should handle buildings with 0 power', () => {
      const buildings = [
        { owner: 'player', type: 'custom', power: 0, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)
      expect(gameState.playerPowerSupply).toBe(0)
      expect(gameState.playerTotalPowerProduction).toBe(0)
      expect(gameState.playerPowerConsumption).toBe(0)
    })

    it('[U03798] should handle very large power values', () => {
      const buildings = [
        { owner: 'player', type: 'megaPlant', power: 1000000, health: 100 }
      ]
      updatePowerSupply(buildings, gameState)
      expect(gameState.playerPowerSupply).toBe(1000000)
    })

    it('[U03799] should handle many buildings efficiently', () => {
      const buildings = []
      for (let i = 0; i < 100; i++) {
        buildings.push({
          owner: 'player',
          type: 'powerPlant',
          power: 10,
          health: 100
        })
      }
      updatePowerSupply(buildings, gameState)
      expect(gameState.playerPowerSupply).toBe(1000)
    })
  })
})
