import { createReplayEntityReference, createReplayUnitReference, recordReplayCommand } from '../replayCommandPrimitives.js'

function getAiReplayTargetPos(moveTarget, mapGrid) {
  if (!moveTarget || !Number.isFinite(moveTarget.x) || !Number.isFinite(moveTarget.y)) {
    return null
  }

  const mapWidth = Array.isArray(mapGrid?.[0]) ? mapGrid[0].length : 0
  const mapHeight = Array.isArray(mapGrid) ? mapGrid.length : 0
  const isTileTarget =
    Number.isInteger(moveTarget.x) &&
    Number.isInteger(moveTarget.y) &&
    moveTarget.x >= 0 &&
    moveTarget.y >= 0 &&
    moveTarget.x < mapWidth &&
    moveTarget.y < mapHeight

  if (isTileTarget) {
    return {
      space: 'tile',
      x: moveTarget.x,
      y: moveTarget.y
    }
  }

  return {
    space: 'world',
    x: moveTarget.x,
    y: moveTarget.y
  }
}

function buildAiReplayUnitCommand(unit, mapGrid) {
  if (!unit?.owner || unit.isBuilding) {
    return null
  }

  const unitRef = createReplayUnitReference(unit)
  if (!unitRef) {
    return null
  }

  if (unit.target) {
    const targetRef = createReplayEntityReference(unit.target)
    if (targetRef) {
      return {
        type: 'unit_command',
        owner: unit.owner,
        unitIds: [unit.id],
        unitRefs: [unitRef],
        command: 'attack',
        targetId: unit.target.id || null,
        targetRef
      }
    }
  }

  const targetPos = getAiReplayTargetPos(unit.moveTarget, mapGrid)
  if (targetPos) {
    return {
      type: 'unit_command',
      owner: unit.owner,
      unitIds: [unit.id],
      unitRefs: [unitRef],
      command: 'move',
      targetPos
    }
  }

  return null
}

function buildAiReplayCommandSignature(command) {
  if (!command) {
    return ''
  }

  return JSON.stringify({
    type: command.type,
    owner: command.owner,
    unitIds: command.unitIds,
    command: command.command,
    targetId: command.targetId || null,
    targetRef: command.targetRef || null,
    targetPos: command.targetPos || null
  })
}

export function recordAiUnitReplayCommand(unit, mapGrid) {
  if (!unit?.owner) {
    return
  }

  const command = buildAiReplayUnitCommand(unit, mapGrid)
  const nextSignature = buildAiReplayCommandSignature(command)
  const previousSignature = unit.replayLastRecordedCommandSignature || ''

  if (!command) {
    if (previousSignature) {
      const unitRef = createReplayUnitReference(unit)
      if (unitRef) {
        recordReplayCommand({
          type: 'unit_command',
          owner: unit.owner,
          unitIds: [unit.id],
          unitRefs: [unitRef],
          command: 'stop_attack'
        }, { source: 'classic-ai', playerId: unit.owner })
      }
    }
    unit.replayLastRecordedCommandSignature = ''
    return
  }

  if (nextSignature === previousSignature) {
    return
  }

  recordReplayCommand(command, { source: 'classic-ai', playerId: unit.owner })
  unit.replayLastRecordedCommandSignature = nextSignature
}
