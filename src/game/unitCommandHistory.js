const MAX_COMMAND_HISTORY = 10
const unitCommandHistory = new Map()
const MIN_HIGH_LEVEL_MOVE_DISTANCE_TILES = 2
const MIN_HIGH_LEVEL_MOVE_LOG_INTERVAL_MS = 1200
const MIN_REROUTE_LOG_INTERVAL_MS = 600

function getOwnerControlSource(unit, gameState) {
  if (!unit) return 'system'
  const owner = unit.owner

  if (Array.isArray(gameState?.partyStates) && gameState.partyStates.length > 0) {
    const partyState = gameState.partyStates.find(p => p.partyId === owner)
    if (partyState) {
      return partyState.aiActive === false ? 'player' : 'ai'
    }
  }

  const humanPlayer = gameState?.humanPlayer
  const isHumanOwner = owner === humanPlayer || (humanPlayer === 'player1' && owner === 'player')
  return isHumanOwner ? 'player' : 'ai'
}

function normalizeTargetReference(target) {
  if (!target) return 'none'
  if (target.id) return `id:${target.id}`
  if (Number.isFinite(target.tileX) && Number.isFinite(target.tileY)) {
    return `tile:${target.tileX},${target.tileY}`
  }
  if (Number.isFinite(target.x) && Number.isFinite(target.y)) {
    return `pos:${target.x},${target.y}`
  }
  return 'unknown'
}

function normalizeMoveTarget(moveTarget) {
  if (!moveTarget || !Number.isFinite(moveTarget.x) || !Number.isFinite(moveTarget.y)) {
    return 'none'
  }
  return `${moveTarget.x},${moveTarget.y}`
}

function buildPathSignature(path = []) {
  if (!Array.isArray(path) || path.length === 0) return 'none'
  const a = path[0]
  const b = path[1]
  if (!a) return 'none'
  const head = `${a.x},${a.y}`
  const next = b ? `${b.x},${b.y}` : '-'
  return `${head}|${next}|len:${path.length}`
}

function buildPathState(path = []) {
  if (!Array.isArray(path) || path.length === 0) {
    return { head: null, next: null, length: 0, signature: 'none' }
  }
  const head = path[0] ? { x: path[0].x, y: path[0].y } : null
  const next = path[1] ? { x: path[1].x, y: path[1].y } : null
  return {
    head,
    next,
    length: path.length,
    signature: buildPathSignature(path)
  }
}

function isExpectedPathProgress(previousPathState, nextPathState) {
  if (!previousPathState?.head || !nextPathState?.head) return false
  if (!previousPathState.next) return false
  const progressedToNextTile =
    previousPathState.next.x === nextPathState.head.x &&
    previousPathState.next.y === nextPathState.head.y
  if (!progressedToNextTile) return false
  return nextPathState.length <= previousPathState.length
}

function appendCommand(unit, entry) {
  if (!unit?.id || !entry) return

  const history = unitCommandHistory.get(unit.id) || []
  const signature = `${entry.type}|${entry.source}|${entry.details || ''}`
  const lastEntry = history.length > 0 ? history[history.length - 1] : null

  if (lastEntry && lastEntry.signature === signature) {
    return
  }

  history.push({ ...entry, signature })
  if (history.length > MAX_COMMAND_HISTORY) {
    history.splice(0, history.length - MAX_COMMAND_HISTORY)
  }
  unitCommandHistory.set(unit.id, history)
}

function shouldLogHighLevelMove(unit, moveTarget, now) {
  if (!moveTarget || !Number.isFinite(moveTarget.x) || !Number.isFinite(moveTarget.y)) {
    return false
  }

  const lastHighLevelMoveTarget = unit._lastHighLevelMoveTarget
  const lastHighLevelMoveTime = unit._lastHighLevelMoveTime || 0
  if (!lastHighLevelMoveTarget) {
    unit._lastHighLevelMoveTarget = { x: moveTarget.x, y: moveTarget.y }
    unit._lastHighLevelMoveTime = now
    return true
  }

  const distance = Math.hypot(
    moveTarget.x - lastHighLevelMoveTarget.x,
    moveTarget.y - lastHighLevelMoveTarget.y
  )
  const intervalElapsed = (now - lastHighLevelMoveTime) >= MIN_HIGH_LEVEL_MOVE_LOG_INTERVAL_MS
  const isNewHighLevelTarget = distance >= MIN_HIGH_LEVEL_MOVE_DISTANCE_TILES

  if (isNewHighLevelTarget && intervalElapsed) {
    unit._lastHighLevelMoveTarget = { x: moveTarget.x, y: moveTarget.y }
    unit._lastHighLevelMoveTime = now
    return true
  }

  return false
}

export function observeUnitCommandSignals(unit, now, gameState) {
  if (!unit || !unit.id) return

  const source = getOwnerControlSource(unit, gameState)
  const moveTargetKey = normalizeMoveTarget(unit.moveTarget)
  const targetKey = normalizeTargetReference(unit.target)
  const retreatKey = unit.isRetreating ? '1' : '0'
  const pathState = buildPathState(unit.path)

  if (unit._lastObservedMoveTargetKey !== moveTargetKey) {
    if (moveTargetKey !== 'none' && shouldLogHighLevelMove(unit, unit.moveTarget, now)) {
      appendCommand(unit, {
        timestamp: now,
        source,
        type: 'move',
        details: moveTargetKey
      })
    }
    unit._lastObservedMoveTargetKey = moveTargetKey
  }

  if (unit._lastObservedTargetKey !== targetKey) {
    if (targetKey !== 'none') {
      appendCommand(unit, {
        timestamp: now,
        source,
        type: 'attack',
        details: targetKey
      })
    }
    unit._lastObservedTargetKey = targetKey
  }

  if (unit._lastObservedRetreatKey !== retreatKey) {
    appendCommand(unit, {
      timestamp: now,
      source,
      type: retreatKey === '1' ? 'retreat_start' : 'retreat_end',
      details: retreatKey === '1' ? 'to-safe-zone' : 'resume-normal'
    })
    unit._lastObservedRetreatKey = retreatKey
  }

  const rerouteIntervalElapsed = !unit._lastRerouteLogTime || (now - unit._lastRerouteLogTime) >= MIN_REROUTE_LOG_INTERVAL_MS
  const sameMoveIntent = unit._lastObservedMoveTargetKey === moveTargetKey && moveTargetKey !== 'none'
  const pathActuallyChanged = Boolean(unit._lastObservedPathState) && pathState.signature !== unit._lastObservedPathState.signature
  const normalPathProgress = isExpectedPathProgress(unit._lastObservedPathState, pathState)
  if (rerouteIntervalElapsed && sameMoveIntent && pathActuallyChanged && !normalPathProgress) {
    appendCommand(unit, {
      timestamp: now,
      source,
      type: 'reroute',
      details: `${moveTargetKey} via ${pathState.signature}`
    })
    unit._lastRerouteLogTime = now
  }
  unit._lastObservedPathState = pathState
}

export function getUnitCommandHistory(unitId) {
  return unitCommandHistory.get(unitId) || []
}

export function clearUnitCommandHistory(unitId) {
  if (!unitId) return
  unitCommandHistory.delete(unitId)
}

export function pruneUnitCommandHistory(activeUnits = []) {
  const activeIds = new Set(activeUnits.map(unit => unit.id))
  unitCommandHistory.forEach((_, unitId) => {
    if (!activeIds.has(unitId)) {
      unitCommandHistory.delete(unitId)
    }
  })
}
