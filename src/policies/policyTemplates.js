import { POLICY_SCHEMA_VERSION } from './policySchema.js'

const hpBelow = value => ({ type: 'compare', field: 'hp', op: '<', value })

export function createBlankPolicy(id) {
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    id,
    name: 'New policy',
    variant: 'unit',
    scope: 'perUnit',
    execution: 'continuous',
    folderId: null,
    initialStateId: 'start',
    states: [
      { id: 'start', name: 'Watch', effect: null, transitions: [] }
    ]
  }
}

function watchAndReact(id, name, scope, execution, kind, when, effect, effectName, delaySeconds) {
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    id,
    name,
    variant: 'unit',
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
    id: 'retreat-if-hurt',
    label: 'Retreat if HP is below 25%',
    description: 'Fires once when HP drops below 25%. Later orders are not overridden.',
    create: id => watchAndReact(id, 'Retreat if HP < 25%', 'perUnit', 'oneTime', 'if', hpBelow(0.25), { type: 'retreat' }, 'Retreat')
  },
  {
    id: 'retreat-while-hurt',
    label: 'Retreat while HP is below 25%',
    description: 'Takes over, even from an older order, whenever HP drops below 25% and stays in effect until it recovers.',
    create: id => watchAndReact(id, 'Retreat while HP < 25%', 'perUnit', 'continuous', 'while', hpBelow(0.25), { type: 'retreat' }, 'Retreat')
  },
  {
    id: 'engage-in-range',
    label: 'Attack while an enemy is in range',
    description: 'Global rule: units attack the nearest enemy as long as one is in weapon range.',
    create: id => watchAndReact(id, 'Attack while enemy in range', 'global', 'continuous', 'while', { type: 'enemyInRange' }, { type: 'attackNearestEnemy' }, 'Attack')
  },
  {
    id: 'advance-after-delay',
    label: 'Move 2 tiles forward after 10 seconds',
    description: 'Does nothing at first. 10 seconds after it is applied the unit moves 2 tiles forward, once.',
    create: id => watchAndReact(id, 'Move forward after 10s', 'perUnit', 'oneTime', 'after', { type: 'always' }, { type: 'moveForward', tiles: 2 }, 'Move forward', 10)
  }
])

let counter = 0

/** Unique-enough document id for a new draft. */
export function createPolicyId() {
  counter += 1
  return `policy-${Date.now().toString(36)}-${counter}`
}
