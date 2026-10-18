/**
 * Unit tests for dangerZoneMap.js
 *
 * Tests the danger zone calculation system for AI pathfinding
 * that determines how dangerous each tile is based on enemy turrets.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  computeBuildingDps,
  generateDangerZoneMapForPlayer,
  updateDangerZoneMaps
} from '../../src/game/dangerZoneMap.js'

describe('dangerZoneMap', () => {
  describe('computeBuildingDps', () => {
    it('[U01145] should calculate DPS for single shot building', () => {
      const building = {
        damage: 10,
        fireCooldown: 1000 // 1 second
      }

      const dps = computeBuildingDps(building)

      expect(dps).toBe(10) // 10 damage per second
    })

    it('[U01146] should calculate DPS for burst fire building', () => {
      const building = {
        damage: 5,
        fireCooldown: 1000,
        burstFire: true,
        burstCount: 3
      }

      const dps = computeBuildingDps(building)

      expect(dps).toBe(15) // 5 damage * 3 bursts per second
    })

    it('[U01147] should handle missing fireCooldown (default 1000)', () => {
      const building = {
        damage: 20
      }

      const dps = computeBuildingDps(building)

      expect(dps).toBe(20)
    })

    it('[U01148] should handle missing burstCount in burst fire mode', () => {
      const building = {
        damage: 10,
        fireCooldown: 500,
        burstFire: true
      }

      const dps = computeBuildingDps(building)

      // burstCount defaults to 1, so 10 * 1 / 0.5 = 20
      expect(dps).toBe(20)
    })

    it('[U01149] should calculate DPS with fast fire rate', () => {
      const building = {
        damage: 5,
        fireCooldown: 250 // 4 shots per second
      }

      const dps = computeBuildingDps(building)

      expect(dps).toBe(20) // 5 * 4 = 20 DPS
    })

    it('[U01150] should handle zero damage', () => {
      const building = {
        damage: 0,
        fireCooldown: 1000
      }

      const dps = computeBuildingDps(building)

      expect(dps).toBe(0)
    })
  })

  describe('generateDangerZoneMapForPlayer', () => {
    let mapGrid
    let gameState

    beforeEach(() => {
      // Create a 10x10 map grid
      mapGrid = Array(10).fill(null).map(() =>
        Array(10).fill(null).map(() => ({ type: 'grass' }))
      )

      gameState = {
        humanPlayer: 'player1',
        playerPowerSupply: 100,
        enemyPowerSupply: 100
      }
    })

    it('[U01151] should return empty array for invalid mapGrid', () => {
      const result = generateDangerZoneMapForPlayer('player1', null, [], gameState)
      expect(result).toEqual([])
    })

    it('[U01152] should return empty array for empty mapGrid', () => {
      const result = generateDangerZoneMapForPlayer('player1', [], [], gameState)
      expect(result).toEqual([])
    })

    it('[U01153] should return empty array for mapGrid with empty first row', () => {
      const result = generateDangerZoneMapForPlayer('player1', [[]], [], gameState)
      expect(result).toEqual([])
    })

    it('[U01154] should create a map of zeros when no buildings exist', () => {
      const result = generateDangerZoneMapForPlayer('player1', mapGrid, [], gameState)

      expect(result).toHaveLength(10)
      expect(result[0]).toHaveLength(10)
      expect(result[5][5]).toBe(0)
    })

    it('[U01155] should ignore buildings without fireRange', () => {
      const buildings = [{
        type: 'powerPlant',
        owner: 'player2',
        x: 5,
        y: 5,
        width: 1,
        height: 1,
        health: 100,
        damage: 10,
        fireCooldown: 1000
        // No fireRange
      }]

      const result = generateDangerZoneMapForPlayer('player1', mapGrid, buildings, gameState)

      // All zeros because building has no fireRange
      expect(result[5][5]).toBe(0)
    })

    it('[U01156] should ignore buildings with zero or negative health', () => {
      const buildings = [{
        type: 'turretGun',
        owner: 'player2',
        x: 5,
        y: 5,
        width: 1,
        height: 1,
        health: 0,
        fireRange: 3,
        damage: 10,
        fireCooldown: 1000
      }]

      const result = generateDangerZoneMapForPlayer('player1', mapGrid, buildings, gameState)

      expect(result[5][5]).toBe(0)
    })

    it('[U01157] should ignore friendly buildings', () => {
      const buildings = [{
        type: 'turretGun',
        owner: 'player1', // Same as playerId
        x: 5,
        y: 5,
        width: 1,
        height: 1,
        health: 100,
        fireRange: 3,
        damage: 10,
        fireCooldown: 1000
      }]

      const result = generateDangerZoneMapForPlayer('player1', mapGrid, buildings, gameState)

      expect(result[5][5]).toBe(0)
    })

    it('[U01158] should add DPS value within turret range', () => {
      const buildings = [{
        type: 'turretGun1',
        owner: 'player2',
        x: 5,
        y: 5,
        width: 1,
        height: 1,
        health: 100,
        fireRange: 2,
        damage: 10,
        fireCooldown: 1000
      }]

      const result = generateDangerZoneMapForPlayer('player1', mapGrid, buildings, gameState)

      // Center should have DPS value
      expect(result[5][5]).toBe(10)
      // Adjacent tiles within range should also have value
      expect(result[5][6]).toBe(10)
    })

    it('[U01159] should not add DPS outside turret range', () => {
      const buildings = [{
        type: 'turretGun1',
        owner: 'player2',
        x: 5,
        y: 5,
        width: 1,
        height: 1,
        health: 100,
        fireRange: 1,
        damage: 10,
        fireCooldown: 1000
      }]

      const result = generateDangerZoneMapForPlayer('player1', mapGrid, buildings, gameState)

      // Far corner should be zero
      expect(result[0][0]).toBe(0)
      expect(result[9][9]).toBe(0)
    })

    it('[U01160] should handle minFireRange (blind spot)', () => {
      const buildings = [{
        type: 'turretGun1',
        owner: 'player2',
        x: 5,
        y: 5,
        width: 1,
        height: 1,
        health: 100,
        fireRange: 3,
        minFireRange: 2,
        damage: 10,
        fireCooldown: 1000
      }]

      const result = generateDangerZoneMapForPlayer('player1', mapGrid, buildings, gameState)

      // Center (within minFireRange) should be zero - blind spot
      expect(result[5][5]).toBe(0)
    })

    it('[U01161] should accumulate DPS from multiple turrets', () => {
      const buildings = [
        {
          type: 'turretGun1',
          owner: 'player2',
          x: 4,
          y: 5,
          width: 1,
          height: 1,
          health: 100,
          fireRange: 2,
          damage: 10,
          fireCooldown: 1000
        },
        {
          type: 'turretGun2',
          owner: 'player2',
          x: 6,
          y: 5,
          width: 1,
          height: 1,
          health: 100,
          fireRange: 2,
          damage: 15,
          fireCooldown: 1000
        }
      ]

      const result = generateDangerZoneMapForPlayer('player1', mapGrid, buildings, gameState)

      // Tile at (5, 5) should be in range of both turrets
      expect(result[5][5]).toBe(25) // 10 + 15
    })

    it('[U01162] should handle rocketTurret with no power', () => {
      gameState.enemyPowerSupply = -10 // No power

      const buildings = [{
        type: 'rocketTurret',
        owner: 'player2',
        x: 5,
        y: 5,
        width: 1,
        height: 1,
        health: 100,
        fireRange: 3,
        damage: 20,
        fireCooldown: 1000
      }]

      const result = generateDangerZoneMapForPlayer('player1', mapGrid, buildings, gameState)

      // Should be zero because no power
      expect(result[5][5]).toBe(0)
    })

    it('[U01163] should handle teslaCoil with no power', () => {
      gameState.enemyPowerSupply = -10 // No power

      const buildings = [{
        type: 'teslaCoil',
        owner: 'player2',
        x: 5,
        y: 5,
        width: 1,
        height: 1,
        health: 100,
        fireRange: 3,
        damage: 20,
        fireCooldown: 1000
      }]

      const result = generateDangerZoneMapForPlayer('player1', mapGrid, buildings, gameState)

      expect(result[5][5]).toBe(0)
    })

    it('[U01164] should handle artilleryTurret type', () => {
      const buildings = [{
        type: 'artilleryTurret',
        owner: 'player2',
        x: 5,
        y: 5,
        width: 1,
        height: 1,
        health: 100,
        fireRange: 3,
        damage: 30,
        fireCooldown: 2000
      }]

      const result = generateDangerZoneMapForPlayer('player1', mapGrid, buildings, gameState)

      expect(result[5][5]).toBe(15) // 30 / 2 = 15 DPS
    })

    it('[U01165] should ignore non-turret buildings', () => {
      const buildings = [{
        type: 'powerPlant',
        owner: 'player2',
        x: 5,
        y: 5,
        width: 1,
        height: 1,
        health: 100,
        fireRange: 3,
        damage: 0,
        fireCooldown: 1000
      }]

      const result = generateDangerZoneMapForPlayer('player1', mapGrid, buildings, gameState)

      expect(result[5][5]).toBe(0)
    })

    it('[U01166] should handle multi-tile buildings correctly', () => {
      const buildings = [{
        type: 'turretGun1',
        owner: 'player2',
        x: 4,
        y: 4,
        width: 2,
        height: 2,
        health: 100,
        fireRange: 2,
        damage: 10,
        fireCooldown: 1000
      }]

      const result = generateDangerZoneMapForPlayer('player1', mapGrid, buildings, gameState)

      // Building center is at (5, 5), check tile in range
      expect(result[5][5]).toBe(10)
    })

    it('[U01167] should handle null buildings array', () => {
      const result = generateDangerZoneMapForPlayer('player1', mapGrid, null, gameState)

      expect(result).toHaveLength(10)
      expect(result[0][0]).toBe(0)
    })
  })

  describe('updateDangerZoneMaps', () => {
    let gameState

    beforeEach(() => {
      gameState = {
        mapGrid: Array(5).fill(null).map(() =>
          Array(5).fill(null).map(() => ({ type: 'grass' }))
        ),
        buildings: [],
        playerCount: 2,
        humanPlayer: 'player1',
        playerPowerSupply: 100,
        enemyPowerSupply: 100,
        dangerZoneMaps: {}
      }
    })

    it('[U01168] should not update when gameState is null', () => {
      updateDangerZoneMaps(null)
      // Should not throw
    })

    it('[U01169] should not update when mapGrid is invalid', () => {
      gameState.mapGrid = null
      updateDangerZoneMaps(gameState)
      expect(gameState.dangerZoneMaps).toEqual({})
    })

    it('[U01170] should not update when mapGrid is empty', () => {
      gameState.mapGrid = []
      updateDangerZoneMaps(gameState)
      expect(gameState.dangerZoneMaps).toEqual({})
    })

    it('[U01171] should not update when mapGrid first row is invalid', () => {
      gameState.mapGrid = [null]
      updateDangerZoneMaps(gameState)
      expect(gameState.dangerZoneMaps).toEqual({})
    })

    it('[U01172] should create danger maps for all players in 2-player game', () => {
      updateDangerZoneMaps(gameState)

      expect(gameState.dangerZoneMaps).toHaveProperty('player1')
      expect(gameState.dangerZoneMaps).toHaveProperty('player2')
    })

    it('[U01173] should create danger maps for all players in 4-player game', () => {
      gameState.playerCount = 4
      updateDangerZoneMaps(gameState)

      expect(gameState.dangerZoneMaps).toHaveProperty('player1')
      expect(gameState.dangerZoneMaps).toHaveProperty('player2')
      expect(gameState.dangerZoneMaps).toHaveProperty('player3')
      expect(gameState.dangerZoneMaps).toHaveProperty('player4')
    })

    it('[U01174] should default to 2 players when playerCount is undefined', () => {
      gameState.playerCount = undefined
      updateDangerZoneMaps(gameState)

      expect(Object.keys(gameState.dangerZoneMaps)).toHaveLength(2)
    })

    it('[U01175] should populate danger maps with correct dimensions', () => {
      updateDangerZoneMaps(gameState)

      expect(gameState.dangerZoneMaps.player1).toHaveLength(5)
      expect(gameState.dangerZoneMaps.player1[0]).toHaveLength(5)
    })

    it('[U01176] should handle missing buildings array', () => {
      gameState.buildings = undefined
      updateDangerZoneMaps(gameState)

      expect(gameState.dangerZoneMaps).toHaveProperty('player1')
    })
  })
})
