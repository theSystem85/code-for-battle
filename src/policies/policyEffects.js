// Effect vocabulary for unit policies: pure data, no game imports.
//
// A state's `effect` is { type, ...params }. The engine turns every effect into
// calls on the unit command API (src/policies/unitCommandApi.js); an effect never
// moves a unit itself.
//
// repeat: how a held (`while`) effect is re-applied while its state is held.
//   "idle"  once the unit has nothing else to do, at most once per second
//   "tick"  on every policy evaluation (turning, aiming, firing)

export const EFFECT_GROUPS = Object.freeze({
  combat: 'Combat',
  movement: 'Movement',
  air: 'Air',
  service: 'Service and support',
  construction: 'Base construction'
})

/** Buildings a build policy may order. Streets and shipyards need a drag or water placement and are not offered. */
export const BUILDABLE_TYPES = Object.freeze([
  { value: 'powerPlant', label: 'Power plant' },
  { value: 'oreRefinery', label: 'Ore refinery' },
  { value: 'vehicleFactory', label: 'Vehicle factory' },
  { value: 'vehicleWorkshop', label: 'Vehicle workshop' },
  { value: 'constructionYard', label: 'Construction yard' },
  { value: 'radarStation', label: 'Radar station' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'gasStation', label: 'Fuel station' },
  { value: 'ammunitionFactory', label: 'Ammo factory' },
  { value: 'helipad', label: 'Helipad' },
  { value: 'airstrip', label: 'Airstrip' },
  { value: 'turretGunV1', label: 'Turret gun V1' },
  { value: 'turretGunV2', label: 'Turret gun V2' },
  { value: 'turretGunV3', label: 'Turret gun V3' },
  { value: 'rocketTurret', label: 'Rocket turret' },
  { value: 'teslaCoil', label: 'Tesla coil' },
  { value: 'artilleryTurret', label: 'Artillery turret' },
  { value: 'concreteWall', label: 'Concrete wall' }
])

const TILES_PARAM = Object.freeze({ key: 'tiles', label: 'tiles', min: 1, max: 20, default: 2 })

const RESOURCE_OPTIONS = Object.freeze([
  { value: 'ammo', label: 'ammo' },
  { value: 'health', label: 'health' },
  { value: 'fuel', label: 'fuel' }
])

export const EFFECTS = Object.freeze({
  attackNearestEnemy: { group: 'combat', label: 'Attack nearest enemy', command: 'attackAndChase', repeat: 'idle', needsEnemy: true },
  autoAttackInRange: { group: 'combat', label: 'Attack enemies in range (no chase)', command: 'autoAttackInRange', repeat: 'tick', needsEnemy: true },
  aimNearestEnemy: { group: 'combat', label: 'Aim at and lock nearest enemy', command: 'aimAndLock', repeat: 'tick', needsEnemy: true },
  fireAtLocked: { group: 'combat', label: 'Fire at the locked target', command: 'fireAtLocked', repeat: 'tick' },
  fireForward: { group: 'combat', label: 'Fire in the turret direction', command: 'fireForward', repeat: 'tick' },
  turretLeft: { group: 'combat', label: 'Turn turret left', command: 'turretLeft', repeat: 'tick' },
  turretRight: { group: 'combat', label: 'Turn turret right', command: 'turretRight', repeat: 'tick' },
  protectNearestFriendly: { group: 'combat', label: 'Protect nearest friendly unit', command: 'protect', repeat: 'idle' },
  hold: { group: 'movement', label: 'Hold position', command: 'stop', repeat: 'idle' },
  retreat: { group: 'movement', label: 'Retreat to base', command: 'retreatTo', repeat: 'idle' },
  moveForward: { group: 'movement', label: 'Move forwards', command: 'moveForward', repeat: 'idle', params: [TILES_PARAM] },
  moveBackward: { group: 'movement', label: 'Move backwards', command: 'moveBackward', repeat: 'idle', params: [TILES_PARAM] },
  moveLeft: { group: 'movement', label: 'Move sideways left (heli)', command: 'moveSidewaysLeft', repeat: 'idle', params: [TILES_PARAM] },
  moveRight: { group: 'movement', label: 'Move sideways right (heli)', command: 'moveSidewaysRight', repeat: 'idle', params: [TILES_PARAM] },
  turnLeft: { group: 'movement', label: 'Turn left', command: 'turnLeft', repeat: 'tick' },
  turnRight: { group: 'movement', label: 'Turn right', command: 'turnRight', repeat: 'tick' },
  takeoff: { group: 'air', label: 'Take off (heli, F-35)', command: 'takeoff', repeat: 'idle' },
  land: { group: 'air', label: 'Land (heli, F-35)', command: 'land', repeat: 'idle' },
  requestRefill: {
    group: 'service',
    label: 'Order a service unit to refill',
    command: 'requestRefill',
    repeat: 'idle',
    params: [{ key: 'resource', label: 'refill', options: RESOURCE_OPTIONS, default: 'ammo' }]
  },
  goToWorkshop: { group: 'service', label: 'Go to a workshop', command: 'goToWorkshop', repeat: 'idle' },
  goToHospital: { group: 'service', label: 'Go to a hospital', command: 'goToHospital', repeat: 'idle' },
  goToAmmoFactory: { group: 'service', label: 'Go to an ammo factory', command: 'goToAmmoFactory', repeat: 'idle' },
  serviceNearestFriendly: { group: 'service', label: 'Service the nearest friendly unit (service units)', command: 'serviceTarget', repeat: 'idle' },
  buildBuilding: {
    variant: 'build',
    group: 'construction',
    label: 'Build a building',
    command: 'buildBuilding',
    repeat: 'idle',
    params: [{ key: 'buildingType', label: 'building', options: BUILDABLE_TYPES, default: 'powerPlant' }]
  }
})

/** Effects offered to a policy of the given variant. Entries without `variant` are unit effects. */
export function effectsForVariant(variant) {
  return Object.keys(EFFECTS).filter(type => (EFFECTS[type].variant || 'unit') === variant)
}

export const EFFECT_TYPES = Object.freeze(Object.keys(EFFECTS))

export function isKnownEffect(type, variant = 'unit') {
  return Object.prototype.hasOwnProperty.call(EFFECTS, type) && (EFFECTS[type].variant || 'unit') === variant
}

export function effectRepeat(type) {
  const meta = EFFECTS[type]
  return meta ? meta.repeat : 'idle'
}

export function effectLabel(effect) {
  if (!effect) return ''
  const meta = EFFECTS[effect.type]
  return meta ? meta.label : String(effect.type)
}

/** Short sentence for rule summaries, including params. */
export function describeEffect(effect) {
  if (!effect) return 'Nothing (wait)'
  const meta = EFFECTS[effect.type]
  if (!meta) return String(effect.type)
  const parts = []
  ;(meta.params || []).forEach(param => {
    const value = effect[param.key] !== undefined ? effect[param.key] : param.default
    if (param.options) {
      const option = param.options.find(item => item.value === value)
      parts.push(option ? option.label : String(value))
    } else {
      parts.push(`${value} ${param.label}`)
    }
  })
  return parts.length ? `${meta.label} (${parts.join(', ')})` : meta.label
}

export function defaultEffectParams(type) {
  const meta = EFFECTS[type]
  const params = {}
  ;(meta && meta.params ? meta.params : []).forEach(param => { params[param.key] = param.default })
  return params
}

/** Problems with an effect's params, as plain sentences. */
export function validateEffectParams(effect) {
  const meta = EFFECTS[effect.type]
  if (!meta || !meta.params) return []
  const problems = []
  meta.params.forEach(param => {
    const value = effect[param.key]
    if (value === undefined) return
    if (param.options) {
      if (!param.options.some(option => option.value === value)) {
        problems.push(`"${value}" is not valid for "${meta.label}".`)
      }
    } else if (typeof value !== 'number' || !Number.isFinite(value) || value < param.min || value > param.max) {
      problems.push(`"${meta.label}" needs ${param.label} between ${param.min} and ${param.max}.`)
    }
  })
  return problems
}

export function effectNeedsEnemy(effect) {
  const meta = effect ? EFFECTS[effect.type] : null
  return Boolean(meta && meta.needsEnemy)
}
