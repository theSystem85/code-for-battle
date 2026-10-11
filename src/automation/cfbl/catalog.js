import { NUMERIC_FIELDS, CHECKS } from '../../policies/policyConditions.js'
import { EFFECTS } from '../../policies/policyEffects.js'

const defenceFields = ['hp', 'ammo', 'reload', 'turretRotation', 'money', 'power', 'buildingCount', 'distance', 'enemyDistance']
const defenceChecks = ['attacking', 'canAttack', 'enemyVisible', 'enemyInFireRange']
const defenceEffects = ['autoAttackInRange', 'aimNearestEnemy', 'fireAtLocked', 'fireForward', 'turretLeft', 'turretRight', 'holdFire', 'resumeFire']
function entries(source, kind) {
  return Object.fromEntries(Object.entries(source).map(([name, meta]) => {
    const variants = [...(meta.variants || [meta.variant || 'unit'])]
    if ((kind === 'field' ? defenceFields : kind === 'check' ? defenceChecks : defenceEffects).includes(name) && !variants.includes('defence')) variants.push('defence')
    return [name, { ...meta, name, kind, variants, params: (meta.params || []).map(param => ({ ...param, integer: param.key === 'quantity' })) }]
  }))
}
export const CFBL_CATALOG = Object.freeze({
  fields: entries(NUMERIC_FIELDS, 'field'),
  checks: entries(CHECKS, 'check'),
  effects: entries({ ...EFFECTS, holdFire: { label: 'Hold fire', variant: 'defence', repeat: 'idle' }, resumeFire: { label: 'Resume normal defence fire', variant: 'defence', repeat: 'idle' } }, 'effect')
})
export function getCatalog(variant = 'unit') {
  return Object.fromEntries(Object.entries(CFBL_CATALOG).map(([kind, items]) => [kind, Object.fromEntries(Object.entries(items).filter(([, meta]) => meta.variants.includes(variant)).map(([name, meta]) => {
    if (variant !== 'defence') return [name, meta]
    return [name, { ...meta, modes: name === 'turretRotation' ? ['absolute'] : meta.modes, params: meta.params.map(param => name === 'distance' && param.key === 'kind' || name === 'canAttack' && param.key === 'kind' ? { ...param, options: param.options.filter(option => option.value === 'unit') } : param) }]
  }))]))
}
