import { DEFENSE_BUILDING_TYPES } from './policyConditions.js'

const TYPES = new Set(DEFENSE_BUILDING_TYPES)
const COMMON_ACTIONS = ['holdFire', 'resumeFire', 'autoAttackInRange', 'aimNearestEnemy', 'fireAtLocked']
const COMMON_FIELDS = ['hp', 'reload', 'money', 'power', 'buildingCount', 'enemyDistance', 'distance']
export const DEFENCE_CAPABILITIES = Object.freeze(Object.fromEntries(DEFENSE_BUILDING_TYPES.map(type => [type, Object.freeze({
  actions: Object.freeze([...COMMON_ACTIONS, ...(type === 'teslaCoil' ? [] : ['turretLeft', 'turretRight']), ...(type.startsWith('turretGun') ? ['fireForward'] : [])]),
  fields: Object.freeze([...COMMON_FIELDS, ...(type === 'teslaCoil' ? [] : ['turretRotation']), ...(type === 'teslaCoil' ? [] : ['ammo'])]),
  checks: Object.freeze(['enemyVisible', 'enemyInFireRange', 'canAttack', 'attacking'])
})])))

export function isProgrammableDefence(building) { return Boolean(building) && TYPES.has(building.type) }
export function isDefenceReady(building) {
  return isProgrammableDefence(building) && building.health > 0 && building.constructionFinished !== false && !building.isBeingSold
}
export function defenceCapabilityReason(building, kind, name, mode) {
  const capability = DEFENCE_CAPABILITIES[building?.type]
  if (!capability || !capability[kind]?.includes(name)) return 'unsupported-capability'
  if (name === 'ammo' && typeof building.maxAmmo !== 'number') return 'untracked-ammo'
  if (name === 'turretRotation' && mode === 'relative') return 'no-body-relative-rotation'
  return null
}
