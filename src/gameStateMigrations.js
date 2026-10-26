import { normalizeDecorationSettings } from './game/decorationSettings.js'
import { GAME_STATE_SCHEMA_VERSION } from './gameStateSchema.js'

// Add one pure function under the version it produces whenever the serialized
// live/save state shape changes. Version 1 is the original, unmigrated shape.
export const migrations = Object.create(null)

// Old queues have no manually suspended stacks; preserve their lane pause state.
migrations[2] = state => {
  const migrateQueue = queue => {
    if (!queue) return queue
    const result = { ...queue }
    for (const key of ['unitItems', 'buildingItems']) {
      if (Array.isArray(queue[key])) {
        result[key] = queue[key].map(item => ({ ...item, stackPaused: false, suspendedProduction: null }))
      }
    }
    if (queue.unitProductionLanes) {
      result.unitProductionLanes = Object.fromEntries(Object.entries(queue.unitProductionLanes)
        .map(([key, lane]) => [key, migrateQueue(lane)]))
    }
    return result
  }
  return { ...state, productionQueueState: migrateQueue(state.productionQueueState) }
}

migrations[3] = state => ({
  ...state,
  units: Array.isArray(state.units)
    ? state.units.map(unit => ({ ...unit, productionCompletedAt: unit.productionCompletedAt ?? null }))
    : state.units,
  productionQueueState: state.productionQueueState
    ? { ...state.productionQueueState, stackedPlacementActive: false }
    : state.productionQueueState
})

migrations[4] = state => ({
  ...state,
  gameState: {
    ...state.gameState,
    ...normalizeDecorationSettings(state.gameState)
  }
})

const AIR_WING_TYPES = new Set(['f22Raptor', 'f35', 'apache'])

migrations[5] = state => ({
  ...state,
  units: Array.isArray(state.units)
    ? state.units.map(unit => {
      if (!unit || typeof unit !== 'object') return unit
      if (unit.type === 'aircraftCarrier') {
        return {
          ...unit,
          carrierStrikeTargetIds: Array.isArray(unit.carrierStrikeTargetIds) ? [...unit.carrierStrikeTargetIds] : []
        }
      }
      if (!AIR_WING_TYPES.has(unit.type)) return unit
      return {
        ...unit,
        homeCarrierId: unit.homeCarrierId ?? null,
        homeAirstripId: unit.homeAirstripId ?? (unit.homeCarrierId ? null : (unit.airstripId || null)),
        carrierStrikeActive: unit.carrierStrikeActive ?? false,
        carrierResumeAttack: unit.carrierResumeAttack ?? false,
        carrierResumeAttackTargetId: unit.carrierResumeAttackTargetId ?? null,
        airGuardInterceptId: unit.airGuardInterceptId ?? null
      }
    })
    : state.units
})

function assertSchemaVersion(version, label) {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new TypeError(`Live state migration ${label} must be a positive integer; received ${String(version)}`)
  }
}

function validateState(state, expectedVersion) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError(`Live state migration to version ${expectedVersion} returned an invalid state object`)
  }
  if (!state.gameState || typeof state.gameState !== 'object' || Array.isArray(state.gameState)) {
    throw new TypeError(`Live state migration to version ${expectedVersion} returned state without a valid gameState`)
  }
}

export function getMissingMigrationVersions(toVersion = GAME_STATE_SCHEMA_VERSION) {
  assertSchemaVersion(toVersion, 'target version')
  const missing = []
  for (let version = 2; version <= toVersion; version += 1) {
    if (typeof migrations[version] !== 'function') missing.push(version)
  }
  return missing
}

export function migrateLiveState(state, fromVersion, toVersion) {
  assertSchemaVersion(fromVersion, 'source version')
  assertSchemaVersion(toVersion, 'target version')
  if (fromVersion > toVersion) {
    throw new Error(`Cannot migrate live state backwards from version ${fromVersion} to ${toVersion}`)
  }

  validateState(state, fromVersion)
  let migrated = state
  for (let version = fromVersion + 1; version <= toVersion; version += 1) {
    const migrate = migrations[version]
    if (typeof migrate !== 'function') {
      throw new Error(`Missing live state migration from version ${version - 1} to ${version}`)
    }
    const previous = migrated
    migrated = migrate(previous)
    validateState(migrated, version)
    if (migrated === previous) {
      throw new Error(`Live state migration to version ${version} must return a new state object`)
    }
    migrated = { ...migrated, schemaVersion: version }
  }

  if (fromVersion === toVersion && state.schemaVersion !== toVersion) {
    migrated = { ...state, schemaVersion: toVersion }
  }
  return migrated
}
