import { afterEach, describe, expect, it } from 'vitest'
import { getMissingMigrationVersions, migrateLiveState, migrations } from '../../src/gameStateMigrations.js'

describe('live game-state migrations', () => {
  const migrateStacks = migrations[2]
  afterEach(() => {
    delete migrations[2]
    delete migrations[3]
  })

  it('[U05419] migrates legacy stacks in every production lane without mutating the save', () => {
    const item = Object.freeze({ type: 'tank' })
    const queue = Object.freeze({ unitItems: [item], unitProductionLanes: { air: { unitItems: [item] } } })
    const result = migrateStacks({ gameState: {}, productionQueueState: queue })
    expect(result.productionQueueState.unitItems[0]).toEqual({ type: 'tank', stackPaused: false, suspendedProduction: null })
    expect(result.productionQueueState.unitProductionLanes.air.unitItems[0].stackPaused).toBe(false)
    expect(item).toEqual({ type: 'tank' })
  })

  it('[U05360] applies ordered pure migrations and stamps each target version', () => {
    const original = Object.freeze({ schemaVersion: 1, gameState: Object.freeze({ money: 10 }) })
    migrations[2] = state => ({ ...state, gameState: { ...state.gameState, credits: state.gameState.money } })
    migrations[3] = state => ({ ...state, gameState: { ...state.gameState, money: undefined, migrated: true } })

    const result = migrateLiveState(original, 1, 3)

    expect(result).toEqual({
      schemaVersion: 3,
      gameState: { money: undefined, credits: 10, migrated: true }
    })
    expect(original).toEqual({ schemaVersion: 1, gameState: { money: 10 } })
  })

  it('[U05361] reports a clear error when an ordered migration is missing', () => {
    delete migrations[2]
    migrations[3] = state => ({ ...state })
    expect(() => migrateLiveState({ schemaVersion: 1, gameState: {} }, 1, 3))
      .toThrow('Missing live state migration from version 1 to 2')
    expect(getMissingMigrationVersions(3)).toEqual([2])
  })

  it('[U05362] rejects invalid versions, backwards migration, and invalid migration output', () => {
    expect(() => migrateLiveState({ gameState: {} }, 0, 1)).toThrow('source version')
    expect(() => migrateLiveState({ gameState: {} }, 2, 1)).toThrow('backwards')
    migrations[2] = () => null
    expect(() => migrateLiveState({ schemaVersion: 1, gameState: {} }, 1, 2)).toThrow('invalid state object')
  })

  it('[U05363] normalizes legacy version-one saves without changing their nested state', () => {
    const legacy = { gameState: { money: 25 }, units: [] }
    const result = migrateLiveState(legacy, 1, 1)
    expect(result).toEqual({ ...legacy, schemaVersion: 1 })
    expect(result.gameState).toBe(legacy.gameState)
  })
})
