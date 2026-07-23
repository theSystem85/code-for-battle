import { gameState } from './gameState.js'
import { getBuildingIdentifier } from './utils.js'

function ensureReplayCommandState() {
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
  return gameState.replay
}

export function createReplayUnitReference(unit) {
  if (!unit || unit.isBuilding) return null
  return {
    id: unit.id || null,
    owner: unit.owner || null,
    type: unit.type || null,
    replaySpawnOrdinal: Number.isFinite(unit.replaySpawnOrdinal) ? unit.replaySpawnOrdinal : null,
    buildDuration: Number.isFinite(unit.buildDuration) ? unit.buildDuration : null
  }
}

export function createReplayEntityReference(entity) {
  if (!entity) return null
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
    return { kind: 'wreck', id: entity.id }
  }
  return {
    kind: 'unit',
    id: entity.id,
    owner: entity.owner || null,
    type: entity.type || null,
    replaySpawnOrdinal: Number.isFinite(entity.replaySpawnOrdinal) ? entity.replaySpawnOrdinal : null,
    buildDuration: Number.isFinite(entity.buildDuration) ? entity.buildDuration : null
  }
}

export function recordReplayCommand(command, metadata = {}) {
  const replay = ensureReplayCommandState()
  if (!replay.recordingActive) return
  const now = Number.isFinite(gameState.simulationTime) ? gameState.simulationTime : Date.now()
  replay.commands.push({
    at: Math.max(0, now - replay.recordingStartedAt),
    command,
    metadata
  })
}
