// Condition vocabulary for unit policies: pure data, no game imports.
//
// Two leaf kinds exist besides the combinators (not / and / or):
//   { type: 'compare', field, op, value, mode?, ...params }  numeric comparison
//   { type: 'check', check, ...params }                       yes/no test
// plus the first-slice leaves that stay valid: always, enemyInRange, underFire
// and compare on hp / enemyDistance without a mode.
//
// Every leaf is measured by the world view (`view.measure(condition)`), which
// the engine implements from real unit and world fields. A measurement that
// does not apply (for example fuel on a unit without a tank) is `undefined`,
// and an unavailable measurement is never true.

export const COMPARE_OPS = Object.freeze(['==', '<=', '>=', '<', '>'])

export const GROUPS = Object.freeze({
  internal: 'Own unit',
  external: 'World',
  sensing: 'Sensing',
  base: 'My base',
  enemies: 'Visible enemies'
})

/** Policy variants a catalog entry may appear in. Entries without `variants` are unit-only. */
export const VARIANT_UNIT = 'unit'
export const VARIANT_BUILD = 'build'
const UNIT_ONLY = Object.freeze([VARIANT_UNIT])
const BUILD_ONLY = Object.freeze([VARIANT_BUILD])
const BOTH_VARIANTS = Object.freeze([VARIANT_UNIT, VARIANT_BUILD])

export const ENEMY_UNIT_TYPES = Object.freeze([
  { value: 'any', label: 'any unit' },
  { value: 'tank_v1', label: 'Tank V1' },
  { value: 'tank-v2', label: 'Tank V2' },
  { value: 'tank-v3', label: 'Tank V3' },
  { value: 'rocketTank', label: 'Rocket tank' },
  { value: 'howitzer', label: 'Howitzer' },
  { value: 'harvester', label: 'Harvester' },
  { value: 'ambulance', label: 'Ambulance' },
  { value: 'tankerTruck', label: 'Tanker truck' },
  { value: 'ammunitionTruck', label: 'Ammunition truck' },
  { value: 'recoveryTank', label: 'Recovery tank' },
  { value: 'apache', label: 'Apache' },
  { value: 'f22Raptor', label: 'F-22 Raptor' },
  { value: 'f35', label: 'F-35' }
])

export const BUILDING_TYPES = Object.freeze([
  { value: 'any', label: 'any building' },
  { value: 'constructionYard', label: 'Construction yard' },
  { value: 'powerPlant', label: 'Power plant' },
  { value: 'oreRefinery', label: 'Ore refinery' },
  { value: 'vehicleFactory', label: 'Vehicle factory' },
  { value: 'vehicleWorkshop', label: 'Vehicle workshop' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'gasStation', label: 'Fuel station' },
  { value: 'ammunitionFactory', label: 'Ammo factory' },
  { value: 'radarStation', label: 'Radar station' },
  { value: 'helipad', label: 'Helipad' },
  { value: 'airstrip', label: 'Airstrip' },
  { value: 'turretGunV1', label: 'Turret gun V1' },
  { value: 'turretGunV2', label: 'Turret gun V2' },
  { value: 'turretGunV3', label: 'Turret gun V3' },
  { value: 'rocketTurret', label: 'Rocket turret' },
  { value: 'teslaCoil', label: 'Tesla coil' },
  { value: 'artilleryTurret', label: 'Artillery turret' }
])

export const DEFENSE_BUILDING_TYPES = Object.freeze([
  'turretGunV1', 'turretGunV2', 'turretGunV3', 'rocketTurret', 'teslaCoil', 'artilleryTurret'
])

export const SERVICE_BUILDING_OPTIONS = Object.freeze([
  { value: 'hospital', label: 'hospital' },
  { value: 'ammunitionFactory', label: 'ammo factory' },
  { value: 'gasStation', label: 'fuel station' },
  { value: 'vehicleWorkshop', label: 'workshop' }
])

const PARKING_OPTIONS = Object.freeze([
  { value: 'airstrip', label: 'an airstrip' },
  { value: 'helipad', label: 'a helipad' },
  { value: 'vehicleWorkshop', label: 'a workshop' }
])

const KIND_OPTIONS = Object.freeze([
  { value: 'unit', label: 'a unit' },
  { value: 'building', label: 'a building' }
])

const RELATIVE = 'relative'
const ABSOLUTE = 'absolute'

/**
 * Numeric fields. `tolerance` is the slack used for "==" so floating point and
 * angle jitter do not make equality impossible.
 */
export const NUMERIC_FIELDS = Object.freeze({
  hp: { group: 'internal', label: 'HP', modes: [RELATIVE, ABSOLUTE], range: [0, 1], absRange: [0, 100000], tolerance: 0.005, absTolerance: 0.5 },
  xp: { group: 'internal', label: 'Experience', modes: [RELATIVE, ABSOLUTE], range: [0, 1], absRange: [0, 100000], tolerance: 0.005, absTolerance: 0.5 },
  rank: { group: 'internal', label: 'Rank (1–3)', modes: [ABSOLUTE], absRange: [0, 3], absTolerance: 0 },
  fuel: { group: 'internal', label: 'Fuel', modes: [RELATIVE, ABSOLUTE], range: [0, 1], absRange: [0, 100000], tolerance: 0.005, absTolerance: 0.5 },
  ammo: { group: 'internal', label: 'Ammo', modes: [RELATIVE, ABSOLUTE], range: [0, 1], absRange: [0, 100000], tolerance: 0.005, absTolerance: 0.5 },
  reload: { group: 'internal', label: 'Reload (1 = ready)', modes: [RELATIVE, ABSOLUTE], range: [0, 1], absRange: [0, 600000], tolerance: 0.005, absTolerance: 50, absSuffix: 'ms left' },
  crew: { group: 'internal', label: 'Crew present', modes: [RELATIVE, ABSOLUTE], range: [0, 1], absRange: [0, 10], tolerance: 0.005, absTolerance: 0 },
  load: { group: 'internal', label: 'Load (cargo)', modes: [RELATIVE, ABSOLUTE], range: [0, 1], absRange: [0, 100000], tolerance: 0.005, absTolerance: 0.5 },
  rotation: { group: 'internal', label: 'Wagon rotation (°)', circular: true, modes: [ABSOLUTE], absRange: [0, 360], absTolerance: 5, absSuffix: '°' },
  turretRotation: { group: 'internal', label: 'Turret rotation (°)', circular: true, modes: [ABSOLUTE, RELATIVE], absRange: [0, 360], range: [-180, 180], tolerance: 5, absTolerance: 5, absSuffix: '°', relSuffix: '° from wagon', relativeAsDegrees: true },
  money: { group: 'external', buildGroup: 'base', variants: BOTH_VARIANTS, label: 'Available money', modes: [ABSOLUTE], absRange: [-1000000000, 1000000000], absTolerance: 0.5 },
  moneyPerMinute: { group: 'external', buildGroup: 'base', variants: BUILD_ONLY, label: 'Money inflow per minute', modes: [ABSOLUTE], absRange: [0, 1000000000], absTolerance: 0.5, absSuffix: '$/min' },
  power: { group: 'external', buildGroup: 'base', variants: BOTH_VARIANTS, label: 'Power surplus', modes: [ABSOLUTE], absRange: [-100000, 100000], absTolerance: 0.5 },
  unitCount: { group: 'external', buildGroup: 'base', variants: BUILD_ONLY, label: 'Number of my units', modes: [ABSOLUTE], absRange: [0, 1000], absTolerance: 0, params: [{ key: 'unitType', label: 'of type', options: ENEMY_UNIT_TYPES, default: 'any' }] },
  enemyUnitCount: { group: 'sensing', buildGroup: 'enemies', variants: BUILD_ONLY, label: 'Number of visible enemy units', modes: [ABSOLUTE], absRange: [0, 1000], absTolerance: 0, params: [{ key: 'unitType', label: 'of type', options: ENEMY_UNIT_TYPES, default: 'any' }] },
  enemyBuildingCount: { group: 'sensing', buildGroup: 'enemies', variants: BUILD_ONLY, label: 'Number of visible enemy buildings', modes: [ABSOLUTE], absRange: [0, 1000], absTolerance: 0, params: [{ key: 'buildingType', label: 'of type', options: BUILDING_TYPES, default: 'any' }] },
  buildingCount: { group: 'external', buildGroup: 'base', variants: BOTH_VARIANTS, label: 'Number of my buildings', modes: [ABSOLUTE], absRange: [0, 1000], absTolerance: 0, params: [{ key: 'buildingType', label: 'of type', options: BUILDING_TYPES, default: 'any' }] },
  distance: { group: 'sensing', label: 'Distance to a visible…', modes: [ABSOLUTE], absRange: [0, 1000], absTolerance: 0.25, absSuffix: 'tiles', params: [{ key: 'kind', label: 'target', options: KIND_OPTIONS.map(item => ({ value: item.value, label: item.label })), default: 'unit' }, { key: 'targetType', label: 'of type', options: ENEMY_UNIT_TYPES, default: 'any' }] },
  enemyDistance: { group: 'sensing', label: 'Nearest enemy (tiles)', modes: [ABSOLUTE], absRange: [0, 1000], absTolerance: 0.25, absSuffix: 'tiles', legacy: true }
})

const HIT_BY = [{ key: 'by', label: 'by', options: KIND_OPTIONS, default: 'unit' }]
const SERVICE_PARAM = { key: 'building', label: 'of a', options: SERVICE_BUILDING_OPTIONS, default: 'hospital' }

/** Yes/no checks. `available` lists unit types that can show the condition; empty means all. */
export const CHECKS = Object.freeze({
  airborne: { group: 'internal', label: 'Is airborne' },
  moving: { group: 'internal', label: 'Is moving' },
  attacking: { group: 'internal', label: 'Is attacking', params: [{ key: 'kind', label: 'a', options: KIND_OPTIONS, default: 'unit' }] },
  serving: { group: 'internal', label: 'Is serving a unit' },
  underService: { group: 'external', label: 'Is under service' },
  underServiceByUnit: { group: 'external', label: 'Is under service by someone' },
  inServiceRange: { group: 'external', label: 'Is in range of a…', params: [SERVICE_PARAM] },
  protectedByUnit: { group: 'external', label: 'Is protected by a unit' },
  inDefenseRange: { group: 'external', label: 'Is in range of a defense or friendly unit', params: [{ key: 'by', label: 'kind', options: [{ value: 'building', label: 'defense building' }, { value: 'unit', label: 'combat or service unit' }], default: 'building' }] },
  canAttack: { group: 'external', label: 'Can attack', params: [{ key: 'kind', label: 'a', options: KIND_OPTIONS, default: 'unit' }] },
  inVisibleRange: { group: 'external', label: 'Is in visible range of an enemy', params: [{ key: 'by', label: 'kind', options: KIND_OPTIONS, default: 'unit' }] },
  parkedAt: { group: 'external', label: 'Is parked at', params: [{ key: 'place', label: 'place', options: PARKING_OPTIONS, default: 'helipad' }] },
  hitDirect: { group: 'external', label: 'Got a direct hit', params: HIT_BY },
  hitIndirect: { group: 'external', label: 'Got an indirect hit', params: HIT_BY },
  underAttackBy: { group: 'external', label: 'Is under attack (attacker visible)', params: HIT_BY },
  enemyVisible: { group: 'sensing', label: 'An enemy is visible', params: [{ key: 'targetType', label: 'of type', options: ENEMY_UNIT_TYPES, default: 'any' }] },
  enemyInFireRange: { group: 'sensing', label: 'An enemy is in my fire range', params: [{ key: 'targetType', label: 'of type', options: ENEMY_UNIT_TYPES, default: 'any' }] },
  myUnitsInEnemyRange: { group: 'sensing', label: 'Some of my units are in an enemy fire range', params: [{ key: 'unitType', label: 'of type', options: ENEMY_UNIT_TYPES, default: 'any' }] }
})

/**
 * Conditions from the requirement list that the game cannot measure today.
 * They are not offered in the editor and fail validation if a document uses them.
 */
export const UNSUPPORTED_CONDITIONS = Object.freeze([
  { id: 'crewByRole', reason: 'Crew is tracked per role (driver, commander, gunner, loader); only the present fraction and count are exposed.' },
  { id: 'attackerInVisibleRangeOfHit', reason: 'Hits record the attacker only for the last hit; a hit history does not exist.' }
])

export const LEGACY_LEAVES = Object.freeze(['always', 'enemyInRange', 'underFire'])
export const COMBINATORS = Object.freeze(['not', 'and', 'or'])
export const CONDITION_TYPES = Object.freeze(['always', 'compare', 'check', 'enemyInRange', 'underFire', 'not', 'and', 'or'])

/** True when a numeric field or check may be used in a policy of `variant`. */
export function isAvailableIn(meta, variant) {
  return Boolean(meta) && (meta.variants || UNIT_ONLY).includes(variant)
}

export function fieldsForVariant(variant) {
  return Object.keys(NUMERIC_FIELDS).filter(field => isAvailableIn(NUMERIC_FIELDS[field], variant))
}

export function isNumericField(field) {
  return Object.prototype.hasOwnProperty.call(NUMERIC_FIELDS, field)
}

export function isCheck(check) {
  return Object.prototype.hasOwnProperty.call(CHECKS, check)
}

export function fieldModes(field) {
  const meta = NUMERIC_FIELDS[field]
  return meta ? meta.modes : []
}

/** Mode a compare uses when the document does not say. */
export function effectiveMode(condition) {
  const meta = NUMERIC_FIELDS[condition.field]
  if (!meta) return ABSOLUTE
  if (condition.mode && meta.modes.includes(condition.mode)) return condition.mode
  return meta.modes[0]
}

/** Equality slack for a compare condition. */
export function compareTolerance(condition) {
  const meta = NUMERIC_FIELDS[condition.field]
  if (!meta) return 0
  const mode = effectiveMode(condition)
  const value = mode === RELATIVE ? meta.tolerance : meta.absTolerance
  return typeof value === 'number' ? value : 0
}

function angularGap(a, b) {
  const gap = Math.abs(a - b) % 360
  return Math.min(gap, 360 - gap)
}

export function compareValues(actual, op, expected, tolerance = 0, circular = false) {
  switch (op) {
    case '==': return (circular ? angularGap(actual, expected) : Math.abs(actual - expected)) <= tolerance
    case '<': return actual < expected
    case '<=': return actual <= expected
    case '>': return actual > expected
    case '>=': return actual >= expected
    default: return false
  }
}

function paramOptions(param) {
  return param.options.map(option => option.value)
}

/** Default parameter values for a condition leaf. */
export function defaultParams(meta) {
  const params = {}
  ;(meta.params || []).forEach(param => { params[param.key] = param.default })
  return params
}

/** Evaluate a compare leaf against a measured value. */
export function compareCondition(condition, actual) {
  const meta = NUMERIC_FIELDS[condition.field]
  const circular = Boolean(meta && meta.circular && effectiveMode(condition) === ABSOLUTE)
  return compareValues(actual, condition.op, condition.value, compareTolerance(condition), circular)
}

/** Params of the catalog entry that matches a leaf (field or check). */
export function leafMeta(condition) {
  if (condition.type === 'compare') return NUMERIC_FIELDS[condition.field] || null
  if (condition.type === 'check') return CHECKS[condition.check] || null
  return null
}

/** Problems with the params of a leaf, as plain sentences. */
export function validateLeafParams(condition) {
  const meta = leafMeta(condition)
  if (!meta || !meta.params) return []
  const problems = []
  meta.params.forEach(param => {
    const value = condition[param.key]
    if (value !== undefined && !paramOptions(param).includes(value)) {
      problems.push(`"${value}" is not a valid ${param.label} for ${meta.label}.`)
    }
  })
  return problems
}

/** Value of a leaf param with the catalog default applied. */
export function paramValue(condition, key) {
  if (condition[key] !== undefined) return condition[key]
  const meta = leafMeta(condition)
  const param = meta && meta.params ? meta.params.find(item => item.key === key) : null
  return param ? param.default : undefined
}

function optionLabel(options, value) {
  const found = options.find(option => option.value === value)
  return found ? found.label : String(value)
}

const SUBJECTS = Object.freeze({
  hp: 'HP',
  xp: 'XP',
  rank: 'rank',
  fuel: 'fuel',
  ammo: 'ammo',
  reload: 'reload',
  crew: 'crew',
  load: 'load',
  rotation: 'wagon rotation',
  turretRotation: 'turret rotation',
  money: 'available money',
  moneyPerMinute: 'money inflow',
  power: 'power surplus',
  enemyDistance: 'nearest enemy'
})

function formatCompareValue(condition, meta) {
  const mode = effectiveMode(condition)
  if (mode === RELATIVE) {
    return meta.relativeAsDegrees ? `${Math.round(condition.value)}°` : `${Math.round(condition.value * 100)}%`
  }
  const rounded = Math.round(condition.value * 100) / 100
  if (!meta.absSuffix) return String(rounded)
  return meta.absSuffix === '°' ? `${rounded}°` : `${rounded} ${meta.absSuffix}`
}

function describeCompare(condition) {
  const meta = NUMERIC_FIELDS[condition.field]
  if (!meta) return 'condition'
  const mode = effectiveMode(condition)
  let subject = SUBJECTS[condition.field] || meta.label
  if (condition.field === 'buildingCount') {
    subject = `my ${optionLabel(BUILDING_TYPES, paramValue(condition, 'buildingType')).toLowerCase()} count`
  } else if (condition.field === 'unitCount') {
    subject = `my ${optionLabel(ENEMY_UNIT_TYPES, paramValue(condition, 'unitType')).toLowerCase()} count`
  } else if (condition.field === 'enemyUnitCount') {
    subject = `visible enemy ${optionLabel(ENEMY_UNIT_TYPES, paramValue(condition, 'unitType')).toLowerCase()} count`
  } else if (condition.field === 'enemyBuildingCount') {
    subject = `visible enemy ${optionLabel(BUILDING_TYPES, paramValue(condition, 'buildingType')).toLowerCase()} count`
  } else if (condition.field === 'distance') {
    const kind = paramValue(condition, 'kind')
    const type = paramValue(condition, 'targetType')
    subject = kind === 'building'
      ? 'distance to a visible enemy building'
      : `distance to a visible ${type === 'any' ? 'enemy unit' : optionLabel(ENEMY_UNIT_TYPES, type)}`
  } else if (condition.field === 'turretRotation' && mode === RELATIVE) {
    subject = 'turret offset from wagon'
  } else if (mode === ABSOLUTE && meta.modes.includes(RELATIVE)) {
    subject = `${subject} (absolute)`
  }
  return `${subject} ${condition.op} ${formatCompareValue(condition, meta)}`
}

function describeCheck(condition) {
  const meta = CHECKS[condition.check]
  if (!meta) return 'condition'
  switch (condition.check) {
    case 'airborne': return 'the unit is airborne'
    case 'moving': return 'the unit is moving'
    case 'attacking': return `the unit is attacking ${optionLabel(KIND_OPTIONS, paramValue(condition, 'kind'))}`
    case 'serving': return 'the unit is serving a unit'
    case 'underService': return 'the unit is under service'
    case 'underServiceByUnit': return 'the unit is under service by someone'
    case 'inServiceRange': return `the unit is in range of a ${optionLabel(SERVICE_BUILDING_OPTIONS, paramValue(condition, 'building'))}`
    case 'protectedByUnit': return 'the unit is protected by a unit'
    case 'inDefenseRange': return paramValue(condition, 'by') === 'unit'
      ? 'the unit is in range of a friendly combat or service unit'
      : 'the unit is in range of a defense building'
    case 'canAttack': return `the unit can attack ${optionLabel(KIND_OPTIONS, paramValue(condition, 'kind'))}`
    case 'inVisibleRange': return `the unit is in visible range of an enemy ${paramValue(condition, 'by')}`
    case 'parkedAt': return `the unit is parked at ${optionLabel(PARKING_OPTIONS, paramValue(condition, 'place'))}`
    case 'hitDirect': return `the unit got a direct hit by ${optionLabel(KIND_OPTIONS, paramValue(condition, 'by'))}`
    case 'hitIndirect': return `the unit got an indirect hit by ${optionLabel(KIND_OPTIONS, paramValue(condition, 'by'))}`
    case 'underAttackBy': return `the unit is under attack by a visible ${paramValue(condition, 'by')}`
    case 'enemyVisible': {
      const type = paramValue(condition, 'targetType')
      return type === 'any' ? 'an enemy is visible' : `an enemy ${optionLabel(ENEMY_UNIT_TYPES, type)} is visible`
    }
    case 'enemyInFireRange': {
      const type = paramValue(condition, 'targetType')
      return type === 'any' ? 'an enemy is in my fire range' : `an enemy ${optionLabel(ENEMY_UNIT_TYPES, type)} is in my fire range`
    }
    case 'myUnitsInEnemyRange': {
      const type = paramValue(condition, 'unitType')
      return type === 'any' ? 'some of my units are in an enemy fire range' : `some of my ${optionLabel(ENEMY_UNIT_TYPES, type)} units are in an enemy fire range`
    }
    default: return meta.label
  }
}

export function describeLeaf(condition) {
  switch (condition.type) {
    case 'always': return 'always'
    case 'enemyInRange': return 'an enemy is in range'
    case 'underFire': return 'the unit is under fire'
    case 'compare': return describeCompare(condition)
    case 'check': return describeCheck(condition)
    default: return 'condition'
  }
}

/** Needs a policy imposes on the engine, used to skip expensive scans. */
export function conditionNeeds(condition, needs = { enemy: false }) {
  if (!condition) return needs
  switch (condition.type) {
    case 'enemyInRange':
      needs.enemy = true
      break
    case 'compare':
      if (condition.field === 'enemyDistance') needs.enemy = true
      break
    case 'not':
      conditionNeeds(condition.of, needs)
      break
    case 'and':
    case 'or':
      condition.of.forEach(child => conditionNeeds(child, needs))
      break
    default:
      break
  }
  return needs
}
