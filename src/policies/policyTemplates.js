import { POLICY_SCHEMA_VERSION } from './policySchema.js'

const hpBelow = value => ({ type: 'compare', field: 'hp', op: '<', value })
const buildCount = (buildingType, op, value) => ({ type: 'compare', field: 'buildingCount', op, value, buildingType })
const buildNow = buildingType => ({ type: 'buildBuilding', buildingType })

export function createBlankPolicy(id, variant = 'unit') {
  const isBuild = variant === 'build'
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    id,
    name: isBuild ? 'New base policy' : 'New policy',
    variant: isBuild ? 'build' : 'unit',
    scope: isBuild ? 'global' : 'perUnit',
    execution: 'continuous',
    folderId: null,
    initialStateId: 'start',
    states: [
      { id: 'start', name: 'Watch', effect: null, transitions: [] }
    ]
  }
}

function watchAndReact(id, name, scope, execution, kind, when, effect, effectName, delaySeconds, variant = 'unit') {
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    id,
    name,
    variant,
    scope,
    execution,
    folderId: null,
    initialStateId: 'watch',
    states: [
      { id: 'watch', name: 'Watch', effect: null, transitions: [kind === 'after' ? { id: 'rule1', kind, when, delaySeconds, to: 'react' } : { id: 'rule1', kind, when, to: 'react' }] },
      { id: 'react', name: effectName, effect, transitions: [] }
    ]
  }
}

export const POLICY_TEMPLATES = Object.freeze([
  {
    variant: 'unit',
    id: 'retreat-if-hurt',
    label: 'Retreat if HP is below 25%',
    description: 'Fires once when HP drops below 25%. Later orders are not overridden.',
    create: id => watchAndReact(id, 'Retreat if HP < 25%', 'perUnit', 'oneTime', 'if', hpBelow(0.25), { type: 'retreat' }, 'Retreat')
  },
  {
    variant: 'unit',
    id: 'retreat-while-hurt',
    label: 'Retreat while HP is below 25%',
    description: 'Takes over, even from an older order, whenever HP drops below 25% and stays in effect until it recovers.',
    create: id => watchAndReact(id, 'Retreat while HP < 25%', 'perUnit', 'continuous', 'while', hpBelow(0.25), { type: 'retreat' }, 'Retreat')
  },
  {
    variant: 'unit',
    id: 'engage-in-range',
    label: 'Attack while an enemy is in range',
    description: 'Global rule: units attack the nearest enemy as long as one is in weapon range.',
    create: id => watchAndReact(id, 'Attack while enemy in range', 'global', 'continuous', 'while', { type: 'enemyInRange' }, { type: 'attackNearestEnemy' }, 'Attack')
  },
  {
    variant: 'unit',
    id: 'advance-after-delay',
    label: 'Move 2 tiles forward after 10 seconds',
    description: 'Does nothing at first. 10 seconds after it is applied the unit moves 2 tiles forward, once.',
    create: id => watchAndReact(id, 'Move forward after 10s', 'perUnit', 'oneTime', 'after', { type: 'always' }, { type: 'moveForward', tiles: 2 }, 'Move forward', 10)
  },
  {
    variant: 'build',
    id: 'build-power-when-short',
    label: 'Build a power plant while power is short',
    description: 'Base automation: queues a power plant whenever the power surplus is below zero and the construction queue is free.',
    create: id => watchAndReact(id, 'Power plant when power is short', 'global', 'continuous', 'while',
      { type: 'compare', field: 'power', op: '<', value: 0 }, { type: 'buildBuilding', buildingType: 'powerPlant' }, 'Build power plant', undefined, 'build')
  },
  {
    variant: 'build',
    id: 'build-second-refinery',
    label: 'Build a second ore refinery when rich',
    description: 'Base automation: with at least $4,000 and fewer than 2 ore refineries, queue one more refinery.',
    create: id => watchAndReact(id, 'Second refinery when rich', 'global', 'continuous', 'while',
      { type: 'and', of: [{ type: 'compare', field: 'money', op: '>=', value: 4000 }, buildCount('oreRefinery', '<', 2)] },
      buildNow('oreRefinery'), 'Build ore refinery', undefined, 'build')
  },
  {
    variant: 'build',
    id: 'build-defense-under-pressure',
    label: 'Build turrets when enemies are visible',
    description: 'Base automation: while 3 or more enemy units are visible and the base has fewer than 3 Turret gun V1, queue another one.',
    create: id => watchAndReact(id, 'Turrets under pressure', 'global', 'continuous', 'while',
      { type: 'and', of: [{ type: 'compare', field: 'enemyUnitCount', op: '>=', value: 3, unitType: 'any' }, buildCount('turretGunV1', '<', 3)] },
      buildNow('turretGunV1'), 'Build turret', undefined, 'build')
  },
  {
    variant: 'build',
    id: 'build-radar-after-delay',
    label: 'Build a radar station after 60 seconds',
    description: 'Base automation: waits 60 seconds after it is enabled, then queues one radar station.',
    create: id => watchAndReact(id, 'Radar after 60s', 'global', 'oneTime', 'after', { type: 'always' }, buildNow('radarStation'), 'Build radar station', 60, 'build')
  }
])

export function templatesForVariant(variant) {
  return POLICY_TEMPLATES.filter(template => template.variant === variant)
}

let counter = 0

/** Unique-enough document id for a new draft. */
export function createPolicyId() {
  counter += 1
  return `policy-${Date.now().toString(36)}-${counter}`
}
