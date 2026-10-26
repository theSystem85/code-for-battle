import { afterEach, describe, expect, it } from 'vitest'
import { DECORATION_SETTINGS, normalizeDecorationSettings } from '../../src/game/decorationSettings.js'
import { getMissingMigrationVersions, migrateLiveState, migrations } from '../../src/gameStateMigrations.js'

describe('live game-state migrations', () => {
  const migrateStacks = migrations[2]
  const migrateReadyPlacement = migrations[3]
  const migrateDecorations = migrations[4]
  afterEach(() => {
    delete migrations[2]
    delete migrations[3]
  })

  it('[U05422] migrates ready-placement state and production history without changing the source', () => {
    const unit = Object.freeze({ id: 'legacy' })
    const original = { gameState: {}, units: [unit], productionQueueState: Object.freeze({ completedBuildings: [] }) }
    const result = migrateReadyPlacement(original)
    expect(result.units[0].productionCompletedAt).toBeNull()
    expect(result.productionQueueState.stackedPlacementActive).toBe(false)
    expect(original.units[0]).toEqual({ id: 'legacy' })
    expect(original.productionQueueState).not.toHaveProperty('stackedPlacementActive')
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

  it('[U05503] fills missing decoration counts on a legacy save without mutating it', () => {
    const gameState = Object.freeze({ money: 4, stoneCount: 40 })
    const original = Object.freeze({ schemaVersion: 3, gameState })
    const result = migrateDecorations(original)
    expect(result).not.toBe(original)
    expect(result.gameState).not.toBe(gameState)
    expect(result.gameState.money).toBe(4)
    expect(result.gameState.stoneCount).toBe(40)
    expect(result.gameState.lakeCount).toBe(DECORATION_SETTINGS.lakeCount.default)
    expect(result.gameState.singleTreeCount).toBe(DECORATION_SETTINGS.singleTreeCount.default)
    expect(result.gameState.decorativeTileCount).toBe(normalizeDecorationSettings(result.gameState).decorativeTileCount)
    expect(gameState).toEqual({ money: 4, stoneCount: 40 })
  })

  it('[U06552] copies air-wing homes onto schema 5 without mutating the save', () => {
    const f22 = Object.freeze({ id: 'f22', type: 'f22Raptor', airstripId: 'strip-1' })
    const carried = Object.freeze({ id: 'f35', type: 'f35', homeCarrierId: 'carrier', airstripId: 'strip-1' })
    const carrier = Object.freeze({ id: 'carrier', type: 'aircraftCarrier' })
    const original = { gameState: { money: 1 }, units: [f22, carried, carrier] }

    const result = migrations[5](original)

    expect(result).not.toBe(original)
    expect(result.units).not.toBe(original.units)
    expect(result.units[0]).toMatchObject({
      homeAirstripId: 'strip-1',
      homeCarrierId: null,
      carrierStrikeActive: false,
      carrierResumeAttack: false,
      airGuardInterceptId: null
    })
    expect(result.units[1].homeAirstripId).toBeNull()
    expect(result.units[1].homeCarrierId).toBe('carrier')
    expect(result.units[2].carrierStrikeTargetIds).toEqual([])
    expect(f22).toEqual({ id: 'f22', type: 'f22Raptor', airstripId: 'strip-1' })
    expect(carrier).toEqual({ id: 'carrier', type: 'aircraftCarrier' })
    expect(original.units[0]).toBe(f22)
  })

  it('[U05363] normalizes legacy version-one saves without changing their nested state', () => {
    const legacy = { gameState: { money: 25 }, units: [] }
    const result = migrateLiveState(legacy, 1, 1)
    expect(result).toEqual({ ...legacy, schemaVersion: 1 })
    expect(result.gameState).toBe(legacy.gameState)
  })
})
