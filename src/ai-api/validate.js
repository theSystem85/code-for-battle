const SUPPORTED_PROTOCOL_VERSION = '1.0'

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function addError(errors, path, message) {
  errors.push({ path, message })
}

function validatePosition(value, path, errors) {
  if (!isObject(value)) {
    addError(errors, path, 'Expected position object')
    return
  }
  if (!Number.isFinite(value.x)) addError(errors, `${path}.x`, 'Expected number')
  if (!Number.isFinite(value.y)) addError(errors, `${path}.y`, 'Expected number')
  if (value.space !== 'tile' && value.space !== 'world') {
    addError(errors, `${path}.space`, 'Expected "tile" or "world"')
  }
}

function validateArray(value, path, errors) {
  if (!Array.isArray(value)) {
    addError(errors, path, 'Expected array')
    return false
  }
  return true
}

function validateStringArray(value, path, errors) {
  if (!validateArray(value, path, errors)) return
  value.forEach((entry, index) => {
    if (typeof entry !== 'string') {
      addError(errors, `${path}[${index}]`, 'Expected string')
    }
  })
}

function validateProtocolVersion(value, errors) {
  if (value !== SUPPORTED_PROTOCOL_VERSION) {
    addError(errors, 'protocolVersion', `Unsupported protocolVersion: ${value}`)
  }
}

export function validateGameTickInput(payload) {
  const errors = []
  if (!isObject(payload)) {
    addError(errors, '', 'Expected object payload')
    return { ok: false, errors }
  }

  validateProtocolVersion(payload.protocolVersion, errors)

  if (typeof payload.matchId !== 'string') addError(errors, 'matchId', 'Expected string')
  if (typeof payload.playerId !== 'string') addError(errors, 'playerId', 'Expected string')
  if (!Number.isFinite(payload.tick)) addError(errors, 'tick', 'Expected number')
  if (!Number.isFinite(payload.sinceTick)) addError(errors, 'sinceTick', 'Expected number')
  if (!['minimal', 'normal', 'full'].includes(payload.verbosity)) {
    addError(errors, 'verbosity', 'Expected minimal | normal | full')
  }

  if (!isObject(payload.meta)) addError(errors, 'meta', 'Expected object')
  if (!isObject(payload.snapshot)) addError(errors, 'snapshot', 'Expected object')
  if (!isObject(payload.transitions)) addError(errors, 'transitions', 'Expected object')
  if (!isObject(payload.constraints)) addError(errors, 'constraints', 'Expected object')

  if (payload.snapshot && Array.isArray(payload.snapshot.units)) {
    payload.snapshot.units.forEach((unit, index) => {
      if (!isObject(unit)) {
        addError(errors, `snapshot.units[${index}]`, 'Expected object')
        return
      }
      if (typeof unit.id !== 'string') addError(errors, `snapshot.units[${index}].id`, 'Expected string')
      if (typeof unit.type !== 'string') addError(errors, `snapshot.units[${index}].type`, 'Expected string')
      if (typeof unit.owner !== 'string') addError(errors, `snapshot.units[${index}].owner`, 'Expected string')
      if (!Number.isFinite(unit.health)) addError(errors, `snapshot.units[${index}].health`, 'Expected number')
      if (!Number.isFinite(unit.maxHealth)) addError(errors, `snapshot.units[${index}].maxHealth`, 'Expected number')
      if (unit.position !== undefined) {
        validatePosition(unit.position, `snapshot.units[${index}].position`, errors)
      }
      validatePosition(unit.tilePosition, `snapshot.units[${index}].tilePosition`, errors)
    })
  }

  if (payload.transitions && payload.transitions.events) {
    validateArray(payload.transitions.events, 'transitions.events', errors)
  }

  return { ok: errors.length === 0, errors }
}

function validateAction(action, index, errors) {
  const path = `actions[${index}]`
  if (!isObject(action)) {
    addError(errors, path, 'Expected object')
    return
  }
  if (typeof action.actionId !== 'string') addError(errors, `${path}.actionId`, 'Expected string')
  if (typeof action.type !== 'string') addError(errors, `${path}.type`, 'Expected string')

  switch (action.type) {
    case 'build_place':
      if (typeof action.buildingType !== 'string') addError(errors, `${path}.buildingType`, 'Expected string')
      validatePosition(action.tilePosition, `${path}.tilePosition`, errors)
      if (action.rallyPoint) validatePosition(action.rallyPoint, `${path}.rallyPoint`, errors)
      break
    case 'build_queue':
      if (typeof action.unitType !== 'string') addError(errors, `${path}.unitType`, 'Expected string')
      if (!Number.isFinite(action.count)) addError(errors, `${path}.count`, 'Expected number')
      if (action.rallyPoint) validatePosition(action.rallyPoint, `${path}.rallyPoint`, errors)
      break
    case 'unit_command':
      validateStringArray(action.unitIds, `${path}.unitIds`, errors)
      if (!['move', 'attack', 'stop', 'hold', 'guard', 'patrol'].includes(action.command)) {
        addError(errors, `${path}.command`, 'Expected valid command')
      }
      if (action.targetPos) validatePosition(action.targetPos, `${path}.targetPos`, errors)
      if (action.targetId && typeof action.targetId !== 'string') {
        addError(errors, `${path}.targetId`, 'Expected string')
      }
      break
    case 'set_rally':
      if (typeof action.buildingId !== 'string') addError(errors, `${path}.buildingId`, 'Expected string')
      validatePosition(action.rallyPoint, `${path}.rallyPoint`, errors)
      break
    case 'cancel':
      break
    case 'ability':
      if (typeof action.unitId !== 'string') addError(errors, `${path}.unitId`, 'Expected string')
      if (typeof action.abilityId !== 'string') addError(errors, `${path}.abilityId`, 'Expected string')
      if (action.targetPos) validatePosition(action.targetPos, `${path}.targetPos`, errors)
      break
    default:
      addError(errors, `${path}.type`, `Unknown action type: ${action.type}`)
  }
}

export function validateGameTickOutput(payload) {
  const errors = []
  if (!isObject(payload)) {
    addError(errors, '', 'Expected object payload')
    return { ok: false, errors }
  }

  validateProtocolVersion(payload.protocolVersion, errors)
  if (!Number.isFinite(payload.tick)) addError(errors, 'tick', 'Expected number')

  if (!validateArray(payload.actions, 'actions', errors)) {
    return { ok: false, errors }
  }

  payload.actions.forEach((action, index) => validateAction(action, index, errors))

  return { ok: errors.length === 0, errors }
}

export function parseGameTickOutput(payload) {
  const result = validateGameTickOutput(payload)
  if (!result.ok) {
    return { ok: false, errors: result.errors }
  }
  return { ok: true, value: payload }
}

export function getSupportedProtocolVersion() {
  return SUPPORTED_PROTOCOL_VERSION
}
