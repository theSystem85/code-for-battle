import { gameState } from './gameState.js'
import { TILE_SIZE } from './config.js'
import { saveGame, loadGameFromState, updateSaveGamesList } from './saveGame.js'
import { showNotification } from './ui/notifications.js'
import { applyGameTickOutput } from './ai-api/applier.js'
import { productionQueue } from './productionQueue.js'
import { CheatSystem } from './input/cheatSystem.js'
import { UnitCommandsHandler } from './input/unitCommands.js'
import { createBuilding, canPlaceBuilding, placeBuilding, updatePowerSupply } from './buildings.js'
import { spawnUnit } from './units.js'
import { getBuildingIdentifier } from './utils.js'
import { getWreckById } from './game/unitWreckManager.js'
import { initiateRetreat } from './behaviours/retreat.js'
import { updateDangerZoneMaps } from './game/dangerZoneMap.js'
import { spawnEnemyUnit } from './ai/enemySpawner.js'
import { initializeSessionRNG } from './network/deterministicRandom.js'
import { terminateAllSounds } from './sound.js'

const REPLAY_STORAGE_PREFIX = 'rts_replay_'
const TEMP_BASELINE_LABEL_PREFIX = '__replay_baseline__'
const replayUnitCommandsHandler = new UnitCommandsHandler()

function sanitizeFileSegment(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
  return cleaned || fallback
}

function buildReplayExportFilename(label, time) {
  const safeLabel = sanitizeFileSegment(label, 'replay')
  const safeDate = Number.isFinite(time)
    ? new Date(time).toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', 'Z')
    : 'unknown-date'
  return `${safeDate}_${safeLabel}.json`
}

function getNowMs() {
  return Number.isFinite(gameState.simulationTime) ? gameState.simulationTime : Date.now()
}

function deriveReplaySessionSeed(state = gameState) {
  return [
    state.mapSeed || '1',
    state.mapTilesX || 0,
    state.mapTilesY || 0,
    state.playerCount || 2,
    Number.isFinite(state.mapOreFieldCount) ? state.mapOreFieldCount : 8
  ].join(':')
}

function ensureReplayDeterminism(state = gameState) {
  initializeSessionRNG(deriveReplaySessionSeed(state), true)
}

function buildReplayActionId(command, replay) {
  return [
    'replay',
    replay.playbackCursor,
    Number.isFinite(command?.at) ? command.at : 0,
    command?.type || 'unknown',
    command?.owner || 'neutral'
  ].join('_')
}

function ensureReplayState() {
  if (!gameState.replay) {
    gameState.replay = {
      recordingActive: false,
      recordingStartedAt: 0,
      recordingLabel: '',
      recordingStartedWallClock: 0,
      commands: [],
      baselineState: null,
      playbackActive: false,
      playbackFinished: false,
      playbackStartedAt: 0,
      playbackCursor: 0,
      playbackCommands: [],
      unitIdAliases: {},
      deferredPlaybackEntries: [],
      pendingPlaybackCompletion: false,
      haltSimulationTick: false
    }
  }
  if (!gameState.replay.unitIdAliases || typeof gameState.replay.unitIdAliases !== 'object') {
    gameState.replay.unitIdAliases = {}
  }
  return gameState.replay
}

function buildReplayStorageKey(label) {
  return `${REPLAY_STORAGE_PREFIX}${label}`
}

function serializeReplay({ label, startedAt, baselineState, commands }) {
  const durationMs = commands.length > 0 ? (commands[commands.length - 1].at || 0) : 0
  return {
    label,
    time: Date.now(),
    startedAt,
    startedAtWallClock: ensureReplayState().recordingStartedWallClock || Date.now(),
    durationMs,
    baselineState,
    commands
  }
}

function formatDuration(durationMs = 0) {
  const totalSeconds = Math.max(0, Math.floor((durationMs || 0) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatReplayTimestamp(timestamp) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}/${month}/${day}, ${hours}:${minutes}:${seconds}`
}

function formatReplayListLabel(timestamp, durationMs = 0) {
  return `${formatReplayTimestamp(timestamp)}, ${formatDuration(durationMs)}`
}

function syncPauseButtonIcon() {
  const pauseBtn = document.getElementById('pauseBtn')
  const playPauseIcon = pauseBtn?.querySelector('.play-pause-icon')
  if (playPauseIcon) {
    playPauseIcon.textContent = gameState.gamePaused ? '▶' : '⏸'
  }
}

function captureBaselineState() {
  const replay = ensureReplayState()
  const baselineLabel = `${TEMP_BASELINE_LABEL_PREFIX}${Date.now()}`
  const baselineKey = `rts_save_${baselineLabel}`
  saveGame(baselineLabel)
  try {
    const raw = localStorage.getItem(baselineKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    replay.baselineState = parsed?.state || null
    return replay.baselineState
  } finally {
    localStorage.removeItem(baselineKey)
    updateSaveGamesList()
  }
}

function getReplayUnitCommandsHandler() {
  return typeof window !== 'undefined' ? window.unitCommandsHandler || null : null
}

function getReplayKeyboardHandler() {
  return typeof window !== 'undefined' ? window.keyboardHandler || null : null
}

function getReplaySelectedUnitsRef() {
  return typeof window !== 'undefined' ? window.selectedUnitsRef || null : null
}

function getReplayRemoteControlApi() {
  return typeof window !== 'undefined' ? window.remoteControlApi || null : null
}

function getReplayUnitsByIds(unitIds = []) {
  const units = Array.isArray(gameState.units) ? gameState.units : []
  const idSet = new Set(Array.isArray(unitIds) ? unitIds : [])
  return units.filter(unit => unit && idSet.has(unit.id))
}

function getReplayUnitAliasMap() {
  return ensureReplayState().unitIdAliases
}

function getReplayReservedLiveUnitIds(excludedRecordedIds = []) {
  const excluded = new Set(Array.isArray(excludedRecordedIds) ? excludedRecordedIds : [])
  return new Set(
    Object.entries(getReplayUnitAliasMap())
      .filter(([recordedId, liveId]) => liveId && !excluded.has(recordedId))
      .map(([, liveId]) => liveId)
  )
}

function resolveReplayUnitByReference(reference, command, reservedLiveIds, usedLiveIds) {
  let candidates = (gameState.units || []).filter(unit => {
    if (!unit || unit.isBuilding) return false
    if (usedLiveIds.has(unit.id)) return false
    if (reservedLiveIds.has(unit.id)) return false
    return true
  })

  const owner = reference?.owner || command?.owner || null
  if (owner) {
    candidates = candidates.filter(unit => unit.owner === owner)
  }

  if (reference?.type) {
    candidates = candidates.filter(unit => unit.type === reference.type)
  }

  if (Number.isFinite(reference?.replaySpawnOrdinal)) {
    const ordinalMatch = candidates.find(unit => unit.replaySpawnOrdinal === reference.replaySpawnOrdinal)
    if (ordinalMatch) {
      return ordinalMatch
    }
  }

  const referenceBuildDuration = Number.isFinite(reference?.buildDuration) ? reference.buildDuration : null
  candidates.sort((left, right) => {
    const leftOrdinal = Number.isFinite(left.replaySpawnOrdinal) ? left.replaySpawnOrdinal : Number.MAX_SAFE_INTEGER
    const rightOrdinal = Number.isFinite(right.replaySpawnOrdinal) ? right.replaySpawnOrdinal : Number.MAX_SAFE_INTEGER
    if (leftOrdinal !== rightOrdinal) {
      return leftOrdinal - rightOrdinal
    }

    if (referenceBuildDuration !== null) {
      const leftDurationDelta = Math.abs((left.buildDuration || 0) - referenceBuildDuration)
      const rightDurationDelta = Math.abs((right.buildDuration || 0) - referenceBuildDuration)
      if (leftDurationDelta !== rightDurationDelta) {
        return leftDurationDelta - rightDurationDelta
      }
    }

    return String(left.id || '').localeCompare(String(right.id || ''))
  })

  return candidates[0] || null
}

function resolveReplayCommandUnits(command = {}) {
  const recordedIds = Array.isArray(command.unitIds) ? command.unitIds.filter(Boolean) : []
  const unitRefs = Array.isArray(command.unitRefs) ? command.unitRefs : []
  const aliasMap = getReplayUnitAliasMap()
  const reservedLiveIds = getReplayReservedLiveUnitIds(recordedIds)
  const usedLiveIds = new Set()
  const count = Math.max(recordedIds.length, unitRefs.length)
  const resolved = []

  for (let index = 0; index < count; index++) {
    const recordedId = recordedIds[index] || unitRefs[index]?.id || null
    let unit = null

    if (recordedId) {
      unit = (gameState.units || []).find(candidate => candidate && candidate.id === recordedId) || null
      if (!unit && aliasMap[recordedId]) {
        unit = (gameState.units || []).find(candidate => candidate && candidate.id === aliasMap[recordedId]) || null
      }
    }

    if (!unit) {
      unit = resolveReplayUnitByReference(unitRefs[index], command, reservedLiveIds, usedLiveIds)
      if (unit && recordedId) {
        aliasMap[recordedId] = unit.id
      }
    }

    if (!unit || usedLiveIds.has(unit.id)) {
      continue
    }

    usedLiveIds.add(unit.id)
    resolved.push(unit)
  }

  return resolved
}

function findReplayTargetById(id) {
  if (!id) {
    return null
  }

  return (gameState.units || []).find(unit => unit && unit.id === id) ||
    (gameState.buildings || []).find(building => building && getBuildingIdentifier(building) === id) ||
    (gameState.buildings || []).find(building => building && building.id === id) ||
    getWreckById(gameState, id) ||
    null
}

function resolveReplayEntityReference(reference) {
  if (!reference || typeof reference !== 'object') {
    return null
  }

  if (reference.kind === 'unit') {
    return (gameState.units || []).find(unit => unit && unit.id === reference.id) || null
  }

  if (reference.kind === 'building') {
    return (gameState.buildings || []).find(building => {
      if (!building) return false
      if (reference.id && getBuildingIdentifier(building) === reference.id) return true
      return building.type === reference.type && building.x === reference.x && building.y === reference.y
    }) || null
  }

  if (reference.kind === 'wreck') {
    return getWreckById(gameState, reference.id) || null
  }

  if (reference.kind === 'ore') {
    return { x: reference.x, y: reference.y }
  }

  if (reference.kind === 'ground') {
    return {
      id: reference.id || `ground_${reference.tileX}_${reference.tileY}`,
      type: 'groundTarget',
      x: reference.x,
      y: reference.y,
      tileX: reference.tileX,
      tileY: reference.tileY,
      health: 1,
      maxHealth: 1,
      isGroundTarget: true
    }
  }

  return null
}

function resolveReplayCommandTarget(command) {
  return resolveReplayEntityReference(command?.targetRef) || findReplayTargetById(command?.targetId)
}

function normalizeReplayRallyPoint(rallyPoint) {
  if (!rallyPoint || typeof rallyPoint !== 'object') {
    return null
  }

  if (rallyPoint.space === 'world') {
    return {
      x: Math.floor(rallyPoint.x / TILE_SIZE),
      y: Math.floor(rallyPoint.y / TILE_SIZE)
    }
  }

  if (Number.isFinite(rallyPoint.x) && Number.isFinite(rallyPoint.y)) {
    return {
      x: rallyPoint.x,
      y: rallyPoint.y
    }
  }

  return null
}

function normalizeReplayTilePosition(position) {
  if (!position || typeof position !== 'object') {
    return null
  }

  if (position.space === 'world') {
    return {
      x: Math.floor(position.x / TILE_SIZE),
      y: Math.floor(position.y / TILE_SIZE)
    }
  }

  if (Number.isFinite(position.x) && Number.isFinite(position.y)) {
    return {
      x: position.x,
      y: position.y
    }
  }

  return null
}

function normalizeReplayWorldPosition(position) {
  if (!position || typeof position !== 'object') {
    return null
  }

  if (position.space === 'tile') {
    return {
      x: (position.x + 0.5) * TILE_SIZE,
      y: (position.y + 0.5) * TILE_SIZE
    }
  }

  if (Number.isFinite(position.x) && Number.isFinite(position.y)) {
    return {
      x: position.x,
      y: position.y
    }
  }

  return null
}

function placeReplayBuilding(command) {
  const tilePosition = normalizeReplayTilePosition(command.tilePosition)
  if (!tilePosition) {
    return false
  }

  const existingBuilding = resolveReplayEntityReference(command.targetRef) || findReplayTargetById(command.buildingId)
  if (existingBuilding) {
    return true
  }

  const units = Array.isArray(gameState.units) ? gameState.units : []
  const buildings = Array.isArray(gameState.buildings) ? gameState.buildings : []
  const factories = Array.isArray(gameState.factories) ? gameState.factories : []
  const mapGrid = gameState.mapGrid || []

  if (!canPlaceBuilding(command.buildingType, tilePosition.x, tilePosition.y, mapGrid, units, buildings, factories, command.owner)) {
    return false
  }

  const building = createBuilding(command.buildingType, tilePosition.x, tilePosition.y)
  building.owner = command.owner || building.owner
  if (command.buildingId) {
    building.id = command.buildingId
  }
  if (command.targetRef?.id) {
    building.id = command.targetRef.id
  }
  if (command.rallyPoint) {
    building.rallyPoint = normalizeReplayRallyPoint(command.rallyPoint)
  }

  gameState.buildings.push(building)
  updateDangerZoneMaps(gameState)
  placeBuilding(building, mapGrid)
  updatePowerSupply(gameState.buildings, gameState)
  return true
}

function replaySpawnUnit(command, metadata = {}) {
  const spawnBuilding = resolveReplayEntityReference(command.factoryRef) || findReplayTargetById(command.factoryId)
  if (!spawnBuilding) {
    return false
  }

  const targetId = command.unitRef?.id || command.unitId || null
  if (targetId && (gameState.units || []).some(unit => unit && unit.id === targetId)) {
    return true
  }

  const unitOptions = {
    id: command.unitRef?.id || null,
    replaySpawnOrdinal: command.unitRef?.replaySpawnOrdinal ?? null,
    buildDuration: command.unitRef?.buildDuration ?? null
  }

  const newUnit = metadata?.source === 'remote-human'
    ? spawnUnit(
      spawnBuilding,
      command.unitType,
      gameState.units || [],
      gameState.mapGrid || [],
      normalizeReplayRallyPoint(command.rallyPoint),
      gameState.occupancyMap,
      unitOptions
    )
    : spawnEnemyUnit(
      spawnBuilding,
      command.unitType,
      gameState.units || [],
      gameState.mapGrid || [],
      gameState,
      getNowMs(),
      command.owner,
      unitOptions
    )

  if (!newUnit) {
    return false
  }

  if (metadata?.source === 'remote-human') {
    newUnit.owner = command.owner || newUnit.owner
  }

  if (!(gameState.units || []).includes(newUnit)) {
    gameState.units.push(newUnit)
  }
  return true
}

export function createReplayUnitReference(unit) {
  if (!unit || unit.isBuilding) {
    return null
  }

  return {
    id: unit.id || null,
    owner: unit.owner || null,
    type: unit.type || null,
    replaySpawnOrdinal: Number.isFinite(unit.replaySpawnOrdinal) ? unit.replaySpawnOrdinal : null,
    buildDuration: Number.isFinite(unit.buildDuration) ? unit.buildDuration : null
  }
}

export function createReplayUnitReferences(unitsOrIds = []) {
  const sourceItems = Array.isArray(unitsOrIds) ? unitsOrIds : []
  const liveUnits = Array.isArray(gameState.units) ? gameState.units : []

  return sourceItems
    .map(item => {
      if (item && typeof item === 'object') {
        return createReplayUnitReference(item)
      }
      return createReplayUnitReference(liveUnits.find(unit => unit && unit.id === item))
    })
    .filter(Boolean)
}

function stopReplayUnitsAttacking(selectedUnits) {
  selectedUnits.forEach(unit => {
    if (unit.isBuilding) {
      unit.forcedAttackTarget = null
      unit.forcedAttackQueue = []
      unit.forcedAttack = false
      unit.holdFire = true
      return
    }

    unit.target = null
    if (unit.isDodging) {
      unit.isDodging = false
      unit.dodgeEndTime = null
      unit.originalPath = null
      unit.originalTarget = null
    }

    if (Array.isArray(unit.path)) {
      unit.path = []
    }
    unit.moveTarget = null
    unit.attackQueue = []
    unit.attackGroupTargets = []
  })
}

function restoreReplaySelectedUnits(unitIds = [], command = null) {
  const selectedUnits = getReplaySelectedUnitsRef()
  if (!selectedUnits || !Array.isArray(selectedUnits)) {
    return false
  }

  const nextUnits = command ? resolveReplayCommandUnits(command) : getReplayUnitsByIds(unitIds)
  if (!nextUnits.length) {
    return false
  }

  selectedUnits.forEach(unit => {
    if (unit) {
      unit.selected = false
    }
  })
  selectedUnits.length = 0

  nextUnits.forEach(unit => {
    unit.selected = true
    selectedUnits.push(unit)
  })

  return true
}

function queueReplayMove(selectedUnits, targetPos) {
  selectedUnits.forEach(unit => {
    if (!unit.commandQueue) unit.commandQueue = []
    unit.commandQueue.push({ type: 'move', x: targetPos.x, y: targetPos.y })
  })
}

function queueReplayAttack(selectedUnits, target) {
  selectedUnits.forEach(unit => {
    if (!unit.commandQueue) unit.commandQueue = []
    unit.commandQueue.push({ type: 'attack', target })
  })
}

function executeReplayUnitCommand(command) {
  restoreReplaySelectedUnits(command.unitIds, command)

  const handler = getReplayUnitCommandsHandler() || replayUnitCommandsHandler
  const selectedUnits = resolveReplayCommandUnits(command)
  const mapGrid = gameState.mapGrid || []

  if (!selectedUnits.length) {
    return false
  }

  switch (command.command) {
    case 'move':
      if (command.queueAppend) {
        if (!command.targetPos) return false
        const queuedTarget = normalizeReplayWorldPosition(command.targetPos)
        if (!queuedTarget) return false
        queueReplayMove(selectedUnits, queuedTarget)
        return true
      }
      if (command.targetPos) {
        const worldTarget = normalizeReplayWorldPosition(command.targetPos)
        if (!worldTarget) return false
        handler.handleMovementCommand(selectedUnits, worldTarget.x, worldTarget.y, mapGrid)
        return true
      }
      return false
    case 'attack': {
      const target = resolveReplayCommandTarget(command)
      if (!target) return false
      if (command.queueAppend) {
        queueReplayAttack(selectedUnits, target)
        return true
      }
      if (target) {
        handler.handleAttackCommand(selectedUnits, target, mapGrid, Boolean(command.forceAttack))
        return true
      }
      return false
    }
    case 'guard': {
      const target = resolveReplayEntityReference(command.targetRef)
      if (!target) return false
      selectedUnits.forEach(unit => {
        unit.guardTarget = target
        unit.guardMode = true
        unit.target = null
        unit.moveTarget = null
      })
      return true
    }
    case 'retreat':
      if (command.targetPos) {
        const retreatTarget = normalizeReplayWorldPosition(command.targetPos)
        if (!retreatTarget) return false
        initiateRetreat(selectedUnits, retreatTarget.x, retreatTarget.y, mapGrid)
        return true
      }
      return false
    case 'stop_attack':
      stopReplayUnitsAttacking(selectedUnits)
      return true
    case 'dodge': {
      const keyboardHandler = getReplayKeyboardHandler()
      if (!keyboardHandler) return false
      keyboardHandler.handleDodgeCommand(selectedUnits, gameState.units || [], mapGrid)
      return true
    }
    case 'workshop_hotkey':
      handler.handleWorkshopRepairHotkey(selectedUnits, mapGrid, Boolean(command.queue), false)
      return true
    case 'apache_helipad':
      return Boolean(handler.handleApacheHelipadCommand(selectedUnits, resolveReplayEntityReference(command.targetRef), mapGrid))
    case 'refinery_unload':
      handler.handleRefineryUnloadCommand(selectedUnits, resolveReplayEntityReference(command.targetRef), mapGrid)
      return true
    case 'harvest_ore':
      handler.handleHarvesterCommand(selectedUnits, resolveReplayEntityReference(command.targetRef), mapGrid)
      return true
    case 'repair_workshop':
      handler.handleRepairWorkshopCommand(selectedUnits, resolveReplayEntityReference(command.targetRef), mapGrid)
      return true
    case 'ambulance_heal':
      handler.handleAmbulanceHealCommand(selectedUnits, resolveReplayEntityReference(command.targetRef), mapGrid, { append: Boolean(command.append) })
      return true
    case 'tanker_refuel':
      handler.handleTankerRefuelCommand(selectedUnits, resolveReplayEntityReference(command.targetRef), mapGrid, { append: Boolean(command.append) })
      return true
    case 'ammo_resupply':
      handler.handleAmmunitionTruckResupplyCommand(selectedUnits, resolveReplayEntityReference(command.targetRef), mapGrid, { append: Boolean(command.append), suppressNotifications: true })
      return true
    case 'ammo_reload':
      handler.handleAmmunitionTruckReloadCommand(selectedUnits, resolveReplayEntityReference(command.targetRef), mapGrid, { append: Boolean(command.append) })
      return true
    case 'ambulance_refill':
      handler.handleAmbulanceRefillCommand(selectedUnits, resolveReplayEntityReference(command.targetRef), mapGrid)
      return true
    case 'gas_refill':
      handler.handleGasStationRefillCommand(selectedUnits, resolveReplayEntityReference(command.targetRef), mapGrid)
      return true
    case 'recovery_tow':
      handler.handleRecoveryTowCommand(selectedUnits, resolveReplayEntityReference(command.targetRef))
      return true
    case 'recovery_tank_repair':
      handler.handleRecoveryTankRepairCommand(selectedUnits, resolveReplayEntityReference(command.targetRef), mapGrid, { append: Boolean(command.append) })
      return true
    case 'recovery_wreck_tow':
      handler.handleRecoveryWreckTowCommand(selectedUnits, resolveReplayEntityReference(command.targetRef), mapGrid, { append: Boolean(command.append) })
      return true
    case 'recovery_wreck_recycle':
      handler.handleRecoveryWreckRecycleCommand(selectedUnits, resolveReplayEntityReference(command.targetRef), mapGrid, { append: Boolean(command.append) })
      return true
    case 'damaged_to_recovery':
      handler.handleDamagedUnitToRecoveryTankCommand(selectedUnits, resolveReplayEntityReference(command.targetRef), mapGrid)
      return true
    case 'service_provider_request': {
      const provider = resolveReplayEntityReference(command.providerRef)
      const requesters = (command.requesterRefs || []).map(resolveReplayEntityReference).filter(Boolean)
      if (!provider || requesters.length === 0) return false
      if (provider.type === 'ammunitionTruck') {
        requesters.forEach(requester => {
          handler.handleAmmunitionTruckResupplyCommand([provider], requester, mapGrid, { suppressNotifications: true })
        })
        return true
      }
      return Boolean(handler.handleServiceProviderRequest(provider, requesters, mapGrid))
    }
    default:
      return false
  }
}

export function createReplayEntityReference(entity) {
  if (!entity) {
    return null
  }

  if (entity.isGroundTarget) {
    return {
      kind: 'ground',
      id: entity.id || null,
      x: entity.x,
      y: entity.y,
      tileX: entity.tileX,
      tileY: entity.tileY
    }
  }

  if (entity.isBuilding) {
    return {
      kind: 'building',
      id: getBuildingIdentifier(entity),
      type: entity.type,
      x: entity.x,
      y: entity.y
    }
  }

  if (entity.sourceUnitId || (gameState.unitWrecks || []).some(wreck => wreck.id === entity.id)) {
    return {
      kind: 'wreck',
      id: entity.id
    }
  }

  return {
    kind: 'unit',
    id: entity.id
  }
}

export function listReplays() {
  const replays = []
  if (typeof localStorage === 'undefined') return replays
  for (const key in localStorage) {
    if (!key.startsWith(REPLAY_STORAGE_PREFIX)) continue
    try {
      const replay = JSON.parse(localStorage.getItem(key))
      replays.push({ key, label: replay?.label || '(no label)', time: replay?.time || 0 })
    } catch (err) {
      window.logger.warn('Failed to parse replay entry:', err)
    }
  }
  replays.sort((a, b) => (b.time || 0) - (a.time || 0))
  return replays
}

export function isReplayInteractionLocked() {
  return Boolean(gameState.replayMode && !gameState.replay?.isApplyingReplayCommand)
}

export function isReplayModeActive() {
  return Boolean(gameState.replayMode)
}

export function isReplayFinishedPaused() {
  return Boolean(gameState.replayMode && gameState.replay?.playbackFinished)
}

export function completeFinishedReplaySession() {
  const replay = ensureReplayState()
  if (!replay.playbackFinished) {
    return false
  }

  replay.playbackFinished = false
  replay.playbackActive = false
  replay.playbackCursor = replay.playbackCommands.length
  replay.playbackCommands = []
  replay.unitIdAliases = {}
  replay.deferredPlaybackEntries = []
  replay.pendingPlaybackCompletion = false
  replay.haltSimulationTick = false
  gameState.replayMode = false
  gameState.gamePaused = false
  syncPauseButtonIcon()
  showNotification('Replay finished. Normal play resumed.')
  return true
}

export function startReplayRecording() {
  const replay = ensureReplayState()
  if (replay.recordingActive) return
  ensureReplayDeterminism()
  const baselineState = captureBaselineState()
  if (!baselineState) {
    showNotification('Replay recording failed: baseline save could not be captured.')
    return
  }

  replay.recordingActive = true
  replay.recordingStartedAt = getNowMs()
  replay.recordingStartedWallClock = Date.now()
  replay.commands = []
  replay.recordingLabel = formatReplayTimestamp(replay.recordingStartedWallClock)
  replay.baselineState = baselineState
  showNotification('Replay recording started')
}

export function stopReplayRecording() {
  const replay = ensureReplayState()
  if (!replay.recordingActive) return

  replay.commands.push({
    at: Math.max(0, getNowMs() - replay.recordingStartedAt),
    command: { type: 'replay_marker' },
    metadata: { source: 'system' }
  })

  replay.recordingActive = false
  const payload = serializeReplay({
    label: replay.recordingLabel,
    startedAt: replay.recordingStartedAt,
    baselineState: replay.baselineState,
    commands: replay.commands
  })
  const key = buildReplayStorageKey(`${payload.time}_${payload.label}`)
  localStorage.setItem(key, JSON.stringify(payload))
  updateReplayList()
  showNotification(`Replay saved (${replay.commands.length} commands)`)
}

export function toggleReplayRecording() {
  const replay = ensureReplayState()
  if (replay.recordingActive) {
    stopReplayRecording()
  } else {
    startReplayRecording()
  }
  updateRecordButtonState()
}

export function recordReplayCommand(command, metadata = {}) {
  const replay = ensureReplayState()
  if (!replay.recordingActive) return
  replay.commands.push({
    at: Math.max(0, getNowMs() - replay.recordingStartedAt),
    command,
    metadata
  })
}

function executeReplayCommand(entry) {
  if (!entry?.command) return
  const { command, metadata } = entry

  if (command.type === 'replay_marker') {
    return
  }

  const replay = ensureReplayState()
  const replayActionId = buildReplayActionId(command, replay)
  replay.isApplyingReplayCommand = true
  try {
    if (command.type === 'unit_command') {
      if (!executeReplayUnitCommand(command)) {
        applyGameTickOutput(gameState, {
          protocolVersion: '1.0',
          tick: gameState.frameCount || 0,
          intent: 'replay',
          confidence: 1,
          notes: 'Replay command execution fallback',
          commentary: null,
          actions: [{ actionId: replayActionId, ...command }]
        }, {
          playerId: command.owner || gameState.humanPlayer
        })
      }
      return
    }

    if (command.type === 'build_place' && (metadata?.source === 'classic-ai' || metadata?.source === 'remote-human')) {
      placeReplayBuilding(command)
      return
    }

    if (command.type === 'build_place' || command.type === 'build_queue') {
      applyGameTickOutput(gameState, {
        protocolVersion: '1.0',
        tick: gameState.frameCount || 0,
        intent: 'replay',
        confidence: 1,
        notes: 'Replay command execution',
        commentary: null,
        actions: [{ actionId: replayActionId, ...command }]
      }, {
        playerId: command.owner || gameState.humanPlayer
      })
      return
    }

    if (command.type === 'set_rally') {
      const building = resolveReplayEntityReference(command.targetRef) || findReplayTargetById(command.buildingId)
      const rallyPoint = normalizeReplayRallyPoint(command.rallyPoint)
      if (building && rallyPoint) {
        building.rallyPoint = rallyPoint
      }
      return
    }

    if (command.type === 'unit_spawn') {
      replaySpawnUnit(command, metadata)
      return
    }

    if (command.type === 'production_add') {
      const isBuilding = Boolean(command.isBuilding)
      const selector = isBuilding
        ? `.production-button[data-building-type="${command.itemType}"]`
        : `.production-button[data-unit-type="${command.itemType}"]`
      const button = document.querySelector(selector)
      if (button) {
        productionQueue.addItem(
          command.itemType,
          button,
          isBuilding,
          command.blueprint || null,
          command.rallyPoint || null,
          { allowReplay: true, record: false }
        )
      }
      return
    }

    if (command.type === 'production_pause') {
      if (command.queueType === 'unit') {
        productionQueue.setUnitPaused(command.paused, { record: false })
      } else if (command.queueType === 'building') {
        productionQueue.setBuildingPaused(command.paused, { record: false })
      }
      return
    }

    if (command.type === 'production_cancel') {
      if (command.queueType === 'unit') {
        const selector = `.production-button[data-unit-type="${command.itemType}"]`
        const button = document.querySelector(selector)
        if (button) {
          if (command.scope === 'queued') {
            productionQueue.removeQueuedUnitByButton(button, { record: false })
          } else {
            productionQueue.cancelUnitProduction({ record: false })
          }
        }
      } else if (command.queueType === 'building') {
        const selector = `.production-button[data-building-type="${command.itemType}"]`
        const button = document.querySelector(selector)
        if (button) {
          if (command.scope === 'queued') {
            productionQueue.removeQueuedBuildingByButton(button, { record: false })
          } else {
            productionQueue.cancelBuildingProduction({ record: false })
          }
        }
      }
      return
    }

    if (command.type === 'remote_control_action') {
      const action = command.action
      const remoteControlApi = getReplayRemoteControlApi()
      if (action && remoteControlApi?.setRemoteControlAction) {
        restoreReplaySelectedUnits(command.selectedUnitIds, {
          unitIds: command.selectedUnitIds,
          unitRefs: command.selectedUnitRefs,
          owner: command.owner
        })
        remoteControlApi.setRemoteControlAction(
          action,
          command.source || 'replay',
          Boolean(command.active),
          Math.max(0, Math.min(1, command.intensity || 1))
        )
      }
      return
    }

    if (command.type === 'remote_control_absolute') {
      const remoteControlApi = getReplayRemoteControlApi()
      if (!remoteControlApi?.setRemoteControlAbsolute) {
        return
      }
      restoreReplaySelectedUnits(command.selectedUnitIds, {
        unitIds: command.selectedUnitIds,
        unitRefs: command.selectedUnitRefs,
        owner: command.owner
      })
      remoteControlApi.setRemoteControlAbsolute(command.source || 'replay', {
        wagonDirection: command.wagonDirection ?? null,
        wagonSpeed: Number.isFinite(command.wagonSpeed) ? command.wagonSpeed : 0,
        turretDirection: command.turretDirection ?? null,
        turretTurnFactor: Number.isFinite(command.turretTurnFactor) ? command.turretTurnFactor : 0
      })
      return
    }

    if (command.type === 'cheat_code') {
      if (!executeReplayCommand.cheatSystemInstance) {
        executeReplayCommand.cheatSystemInstance = new CheatSystem()
      }
      executeReplayCommand.cheatSystemInstance.processCheatCode(command.code || '')
    }
  } finally {
    replay.isApplyingReplayCommand = false
  }
}

function shouldDeferReplayEntry(entry) {
  const source = entry?.metadata?.source
  return source === 'classic-ai' || source === 'llm'
}

export function updateReplayPlayback() {
  const replay = ensureReplayState()
  if (!replay.playbackActive || gameState.gamePaused) return

  replay.haltSimulationTick = false

  const elapsed = Math.max(0, getNowMs() - replay.playbackStartedAt)
  while (replay.playbackCursor < replay.playbackCommands.length && replay.playbackCommands[replay.playbackCursor].at <= elapsed) {
    const entry = replay.playbackCommands[replay.playbackCursor]
    if (entry?.command?.type === 'replay_marker') {
      replay.playbackCursor = replay.playbackCommands.length
      replay.pendingPlaybackCompletion = true
      replay.playbackActive = false
      replay.haltSimulationTick = true
      break
    }

    if (shouldDeferReplayEntry(entry)) {
      replay.deferredPlaybackEntries.push(entry)
    } else {
      executeReplayCommand(entry)
    }
    replay.playbackCursor += 1
  }

  if (replay.playbackCursor >= replay.playbackCommands.length) {
    replay.pendingPlaybackCompletion = true
    replay.playbackActive = false
  }
}

export function consumeReplaySimulationHaltFlag() {
  const replay = ensureReplayState()
  const shouldHalt = Boolean(replay.haltSimulationTick)
  replay.haltSimulationTick = false
  return shouldHalt
}

export function flushDeferredReplayPlayback() {
  const replay = ensureReplayState()
  if (!Array.isArray(replay.deferredPlaybackEntries) || replay.deferredPlaybackEntries.length === 0) {
    return
  }

  const deferredEntries = replay.deferredPlaybackEntries.splice(0)
  deferredEntries.forEach(entry => {
    executeReplayCommand(entry)
  })
}

export function finalizeReplayPlaybackIfPending() {
  const replay = ensureReplayState()
  if (!replay.pendingPlaybackCompletion || replay.playbackFinished) {
    return
  }

  if (Array.isArray(replay.deferredPlaybackEntries) && replay.deferredPlaybackEntries.length > 0) {
    return
  }

  replay.pendingPlaybackCompletion = false
  replay.playbackFinished = true
  gameState.gamePaused = true
  syncPauseButtonIcon()
  showNotification('Replay finished. Game paused. Press Start to continue normal play.')
}

export function loadReplay(key) {
  if (typeof localStorage === 'undefined') return
  const raw = localStorage.getItem(key)
  if (!raw) return

  const parsed = JSON.parse(raw)
  if (!parsed?.baselineState) {
    showNotification('Replay is missing baseline state')
    return
  }

  terminateAllSounds()
  loadGameFromState(parsed.baselineState, `${TEMP_BASELINE_LABEL_PREFIX}load_${Date.now()}`)

  const replay = ensureReplayState()
  replay.playbackActive = true
  replay.playbackFinished = false
  replay.playbackStartedAt = getNowMs()
  replay.playbackCursor = 0
  replay.playbackCommands = Array.isArray(parsed.commands) ? parsed.commands : []
  replay.unitIdAliases = {}
  replay.deferredPlaybackEntries = []
  replay.pendingPlaybackCompletion = false
  replay.haltSimulationTick = false
  gameState.gamePaused = false
  gameState.replayMode = true
  syncPauseButtonIcon()
  showNotification(`Loaded replay: ${parsed.label || 'Unnamed replay'}`)
}

function isReplayImportPayload(replayObj) {
  return Boolean(replayObj)
    && typeof replayObj === 'object'
    && typeof replayObj.baselineState !== 'undefined'
    && Array.isArray(replayObj.commands)
}

export function importReplayFromObject(replayObj) {
  if (typeof localStorage === 'undefined') return null

  if (!isReplayImportPayload(replayObj)) {
    showNotification('Import failed: unsupported replay file format')
    return null
  }

  const importedLabel = typeof replayObj.label === 'string' && replayObj.label.trim()
    ? replayObj.label.trim()
    : `Imported Replay ${new Date().toLocaleString()}`
  const normalizedReplay = {
    ...replayObj,
    label: importedLabel,
    time: Number.isFinite(replayObj.time) ? replayObj.time : Date.now(),
    baselineState: typeof replayObj.baselineState === 'string'
      ? replayObj.baselineState
      : JSON.stringify(replayObj.baselineState),
    commands: Array.isArray(replayObj.commands) ? replayObj.commands : []
  }
  const replayKey = buildReplayStorageKey(`${normalizedReplay.time}_${normalizedReplay.label}`)

  try {
    localStorage.setItem(replayKey, JSON.stringify(normalizedReplay))
  } catch (err) {
    window.logger.warn('Failed to store imported replay:', err)
    showNotification('Import failed: could not store replay')
    return null
  }

  return {
    key: replayKey,
    label: normalizedReplay.label
  }
}

export function updateRecordButtonState() {
  const replay = ensureReplayState()
  const recordBtn = document.getElementById('recordBtn')
  if (!recordBtn) return
  recordBtn.classList.toggle('recording-active', replay.recordingActive)
  recordBtn.setAttribute('aria-pressed', replay.recordingActive ? 'true' : 'false')
}

export function exportReplay(key) {
  if (typeof localStorage === 'undefined') return

  const rawReplay = localStorage.getItem(key)
  if (!rawReplay) {
    window.logger.warn('No replay found to export for key:', key)
    return
  }

  let replayObj = null
  try {
    replayObj = JSON.parse(rawReplay)
  } catch (err) {
    window.logger.warn('Failed to parse replay data for export:', err)
    return
  }

  const payload = JSON.stringify(replayObj, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = buildReplayExportFilename(replayObj?.label, replayObj?.time)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

export function deleteReplay(key) {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(key)
}

function createReplayRowActionButton({ title, ariaLabel, html, onClick }) {
  const button = document.createElement('button')
  button.type = 'button'
  button.title = title
  button.setAttribute('aria-label', ariaLabel)
  button.classList.add('action-button', 'icon-button')
  button.style.marginLeft = '6px'
  button.innerHTML = html
  button.onclick = (event) => {
    event.stopPropagation()
    onClick()
  }
  return button
}

export function updateReplayList() {
  const list = document.getElementById('replayList')
  if (!list) return
  list.innerHTML = ''

  listReplays().forEach(replay => {
    const rawReplay = JSON.parse(localStorage.getItem(replay.key) || '{}')
    const startTs = Number.isFinite(rawReplay.startedAtWallClock) ? rawReplay.startedAtWallClock : replay.time
    const durationMs = Number.isFinite(rawReplay.durationMs) ? rawReplay.durationMs : (
      Array.isArray(rawReplay.commands) && rawReplay.commands.length > 0 ? rawReplay.commands[rawReplay.commands.length - 1].at : 0
    )
    const li = document.createElement('li')
    li.style.display = 'flex'
    li.style.alignItems = 'center'
    li.style.justifyContent = 'space-between'
    li.style.padding = '2px 0'

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'save-game-label-button'
    btn.style.flex = '1'
    const replayLabel = formatReplayListLabel(startTs, durationMs)
    btn.title = `Load ${replayLabel}`
    btn.textContent = replayLabel
    btn.onclick = () => loadReplay(replay.key)
    li.appendChild(btn)

    li.appendChild(createReplayRowActionButton({
      title: 'Export replay as JSON',
      ariaLabel: 'Export replay',
      html: '<img src="/icons/export.svg" alt="Export" class="button-icon white-icon">',
      onClick: () => exportReplay(replay.key)
    }))

    li.appendChild(createReplayRowActionButton({
      title: 'Delete replay',
      ariaLabel: 'Delete replay',
      html: '✗',
      onClick: () => {
        deleteReplay(replay.key)
        updateReplayList()
      }
    }))

    list.appendChild(li)
  })
}

export function initReplaySystem() {
  ensureReplayState()
  if (typeof window !== 'undefined') {
    window.recordReplayCommand = recordReplayCommand
  }

  const recordBtn = document.getElementById('recordBtn')
  if (recordBtn && recordBtn.dataset.boundReplay !== 'true') {
    recordBtn.dataset.boundReplay = 'true'
    recordBtn.addEventListener('click', () => toggleReplayRecording())
  }

  const saveTab = document.getElementById('saveListTab')
  const replayTab = document.getElementById('replayListTab')
  const savePane = document.getElementById('saveGamesPane')
  const replayPane = document.getElementById('replaysPane')

  const activateTab = (tab) => {
    const showReplays = tab === 'replays'
    saveTab?.classList.toggle('active', !showReplays)
    replayTab?.classList.toggle('active', showReplays)
    savePane?.classList.toggle('hidden', showReplays)
    replayPane?.classList.toggle('hidden', !showReplays)
  }

  saveTab?.addEventListener('click', () => activateTab('saves'))
  replayTab?.addEventListener('click', () => activateTab('replays'))

  updateRecordButtonState()
  updateReplayList()
}
