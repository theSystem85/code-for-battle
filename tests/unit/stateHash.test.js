import { describe, it, expect } from 'vitest'
import {
  compareHashes,
  computeQuickHash,
  computeStateHash,
  createHashReport,
  hashArrayOrdered,
  hashMapGrid
} from '../../src/network/stateHash.js'

describe('stateHash', () => {
  it('[U04211] computes ordered hashes deterministically', () => {
    const hashFn = (value) => value * 31

    const hashA = hashArrayOrdered([1, 2, 3], hashFn)
    const hashB = hashArrayOrdered([1, 2, 3], hashFn)
    const hashC = hashArrayOrdered([3, 2, 1], hashFn)

    expect(hashA).toBe(hashB)
    expect(hashA).not.toBe(hashC)
  })

  it('[U04212] hashes ore tiles in the map grid', () => {
    const mapGrid = [
      [{ type: 'land' }, { type: 'land', ore: true }],
      [{ type: 'land', ore: true, seedCrystal: true }, { type: 'land' }]
    ]

    const hash = hashMapGrid(mapGrid)
    expect(typeof hash).toBe('number')
    expect(hash).not.toBe(0)
  })

  it('[U04213] computes deterministic state hashes', () => {
    const gameState = {
      units: [
        { id: 'u1', type: 'tank', owner: 'player1', x: 10, y: 20, tileX: 0, tileY: 1, health: 50, maxHealth: 100, direction: 0 },
        { id: 'u2', type: 'harvester', owner: 'player1', x: 20, y: 30, tileX: 1, tileY: 1, health: 100, maxHealth: 100, direction: 1 }
      ],
      buildings: [
        { id: 'b1', type: 'powerPlant', owner: 'player1', x: 3, y: 4, health: 100, maxHealth: 100, constructionFinished: true }
      ],
      bullets: [
        { id: 1, type: 'shell', owner: 'player1', x: 5, y: 5, targetX: 10, targetY: 10, damage: 20 }
      ],
      mines: [
        { id: 1, owner: 'player1', x: 7, y: 7, armed: true }
      ],
      partyStates: [{ partyId: 'player1', money: 500 }],
      money: 500
    }

    const hash = computeStateHash(gameState, 12)
    const sameHash = computeStateHash(gameState, 12)
    const differentHash = computeStateHash({ ...gameState, money: 400 }, 12)

    expect(compareHashes(hash, sameHash)).toBe(true)
    expect(compareHashes(hash, differentHash)).toBe(false)
  })

  it('[U04214] computes quick hash based on counts and totals', () => {
    const gameState = {
      units: [{ health: 50 }, { health: 25 }],
      buildings: [{ health: 100 }],
      money: 250
    }

    const hash = computeQuickHash(gameState, 5)

    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })

  it('[U04215] creates a hash report with component hashes', () => {
    const gameState = {
      units: [{ id: 'u1', type: 'tank', owner: 'player1', x: 0, y: 0, tileX: 0, tileY: 0, health: 100, maxHealth: 100, direction: 0 }],
      buildings: [],
      bullets: [],
      mines: [],
      money: 100
    }

    const report = createHashReport(gameState, 3)

    expect(report).toMatchObject({
      tick: 3,
      unitCount: 1,
      buildingCount: 0,
      bulletCount: 0,
      mineCount: 0,
      money: 100
    })
    expect(report.fullHash).toMatch(/^[0-9a-f]{8}$/)
  })
})
