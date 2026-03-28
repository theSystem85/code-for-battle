const MAX_COMMAND_HISTORY = 10
const unitCommandHistory = new Map()

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

export function observeUnitCommandSignals(unit, now, gameState) {
  if (!unit || !unit.id) return

  const source = getOwnerControlSource(unit, gameState)
  const moveTargetKey = normalizeMoveTarget(unit.moveTarget)
  const targetKey = normalizeTargetReference(unit.target)
  const retreatKey = unit.isRetreating ? '1' : '0'

  if (unit._lastObservedMoveTargetKey !== moveTargetKey) {
    if (moveTargetKey !== 'none') {
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
