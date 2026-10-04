// Condition helpers for the block builder.
//
// A condition is a tree: leaves (a comparison, a yes/no check, or one of the
// first-slice atoms) combined with AND / OR and negated with NOT. The editor
// shows the tree as nested "all of / any of" groups with an optional "not" on
// every block. Flat helpers (conditionToRows / rowsToCondition) are kept for
// the simple one-level case.

import {
  CHECKS,
  COMPARE_OPS,
  GROUPS,
  NUMERIC_FIELDS,
  defaultParams,
  describeLeaf,
  effectiveMode,
  fieldModes
} from '../../policies/policyConditions.js'
import { formatDelay } from '../../policies/policyDelay.js'
import { EFFECTS, EFFECT_GROUPS, describeEffect } from '../../policies/policyEffects.js'

export const MAX_EDITOR_DEPTH = 3

const LEGACY_ATOMS = Object.freeze([
  { id: 'enemyInRange', label: 'Enemy in weapon range', group: 'sensing' },
  { id: 'underFire', label: 'Recently under fire', group: 'external' },
  { id: 'always', label: 'Always', group: 'internal' }
])

function buildAtomKinds() {
  const kinds = []
  Object.entries(NUMERIC_FIELDS).forEach(([id, meta]) => {
    kinds.push({ id, label: meta.label, group: meta.group, type: 'compare' })
  })
  Object.entries(CHECKS).forEach(([id, meta]) => {
    kinds.push({ id, label: meta.label, group: meta.group, type: 'check' })
  })
  LEGACY_ATOMS.forEach(atom => kinds.push({ ...atom, type: atom.id }))
  return kinds
}

export const ATOM_KINDS = Object.freeze(buildAtomKinds())

/** Atom kinds grouped for a select with option groups. */
export const ATOM_GROUPS = Object.freeze(Object.entries(GROUPS).map(([id, label]) => ({
  id,
  label,
  kinds: ATOM_KINDS.filter(kind => kind.group === id)
})).filter(group => group.kinds.length > 0))

export const COMPARE_OPERATORS = COMPARE_OPS

export function atomKind(atom) {
  if (atom.type === 'compare') return atom.field
  if (atom.type === 'check') return atom.check
  return atom.type
}

function isAtom(condition) {
  return Boolean(condition) && ['always', 'compare', 'check', 'enemyInRange', 'underFire'].includes(condition.type)
}

function toRow(condition) {
  if (isAtom(condition)) return { not: false, atom: condition }
  if (condition && condition.type === 'not' && isAtom(condition.of)) return { not: true, atom: condition.of }
  return null
}

/** @returns {{ mode: 'and' | 'or', rows: Array<{ not: boolean, atom: object }> } | null} */
export function conditionToRows(condition) {
  const single = toRow(condition)
  if (single) return { mode: 'and', rows: [single] }
  if (condition && (condition.type === 'and' || condition.type === 'or') && Array.isArray(condition.of)) {
    const rows = condition.of.map(toRow)
    if (rows.every(Boolean)) return { mode: condition.type, rows }
  }
  return null
}

export function rowsToCondition(mode, rows) {
  const parts = rows.map(row => (row.not ? { type: 'not', of: row.atom } : row.atom))
  if (parts.length === 0) return { type: 'always' }
  if (parts.length === 1) return parts[0]
  return { type: mode, of: parts }
}

/** A fresh leaf of the given kind with sensible defaults. */
export function makeAtom(kind) {
  const field = NUMERIC_FIELDS[kind]
  if (field) {
    const mode = field.modes[0]
    const atom = { type: 'compare', field: kind, op: '<', value: defaultCompareValue(kind, mode) }
    if (field.modes.length > 1) atom.mode = mode
    return { ...atom, ...defaultParams(field) }
  }
  if (CHECKS[kind]) return { type: 'check', check: kind, ...defaultParams(CHECKS[kind]) }
  switch (kind) {
    case 'enemyInRange': return { type: 'enemyInRange' }
    case 'underFire': return { type: 'underFire' }
    default: return { type: 'always' }
  }
}

function defaultCompareValue(field, mode) {
  switch (field) {
    case 'hp': return 0.25
    case 'enemyDistance': return 6
    case 'rank': return 2
    case 'rotation':
    case 'turretRotation': return 90
    case 'money': return 1000
    case 'power': return 0
    case 'buildingCount': return 1
    case 'distance': return 6
    case 'reload': return mode === 'relative' ? 1 : 0
    case 'crew': return 1
    default: return mode === 'relative' ? 0.25 : 0
  }
}

/** Switch a compare leaf between relative and absolute, resetting the value to a sane default. */
export function setCompareMode(atom, mode) {
  if (!fieldModes(atom.field).includes(mode)) return atom
  atom.mode = mode
  atom.value = defaultCompareValue(atom.field, mode)
  return atom
}

/** How the value of a compare leaf is shown and edited. */
export function compareValueView(atom) {
  const meta = NUMERIC_FIELDS[atom.field]
  const mode = effectiveMode(atom)
  if (!meta) return { scale: 1, min: 0, max: 100, step: 1, suffix: '' }
  if (mode === 'relative') {
    if (meta.relativeAsDegrees) return { scale: 1, min: meta.range[0], max: meta.range[1], step: 1, suffix: meta.relSuffix || '°' }
    return { scale: 100, min: 0, max: 100, step: 1, suffix: '%' }
  }
  const [min, max] = meta.absRange
  return { scale: 1, min, max, step: meta.absSuffix === 'tiles' ? 0.5 : 1, suffix: meta.absSuffix || '' }
}

export function describeCondition(condition) {
  if (!condition) return 'always'
  if (isAtom(condition)) return describeLeaf(condition)
  if (condition.type === 'not') return `not (${describeCondition(condition.of)})`
  if (condition.type === 'and' || condition.type === 'or') {
    return condition.of.map(child => {
      const text = describeCondition(child)
      return (child.type === 'and' || child.type === 'or') ? `(${text})` : text
    }).join(condition.type === 'and' ? ' and ' : ' or ')
  }
  return 'condition'
}

// --- tree helpers for the nested editor ------------------------------------

/**
 * @typedef {{ not: boolean, atom: object } | { not: boolean, mode: 'and'|'or', children: object[] }} EditorNode
 */

export function conditionToTree(condition) {
  if (!condition) return { not: false, atom: { type: 'always' } }
  if (condition.type === 'not') {
    const inner = conditionToTree(condition.of)
    return { ...inner, not: !inner.not }
  }
  if ((condition.type === 'and' || condition.type === 'or') && Array.isArray(condition.of)) {
    return { not: false, mode: condition.type, children: condition.of.map(conditionToTree) }
  }
  return { not: false, atom: condition }
}

export function treeToCondition(node) {
  let core
  if (node.children) {
    const parts = node.children.map(treeToCondition)
    if (parts.length === 0) core = { type: 'always' }
    else if (parts.length === 1) core = parts[0]
    else core = { type: node.mode, of: parts }
  } else {
    core = node.atom
  }
  return node.not ? { type: 'not', of: core } : core
}

export function treeDepth(node) {
  if (!node.children || node.children.length === 0) return 1
  return 1 + Math.max(...node.children.map(treeDepth))
}

// --- effects ---------------------------------------------------------------

export const EFFECT_LABELS = Object.freeze(Object.fromEntries(
  Object.entries(EFFECTS).map(([id, meta]) => [id, meta.label])
))

/** Effects grouped for a select with option groups. */
export const EFFECT_OPTION_GROUPS = Object.freeze(Object.entries(EFFECT_GROUPS).map(([id, label]) => ({
  id,
  label,
  effects: Object.entries(EFFECTS).filter(([, meta]) => meta.group === id).map(([type, meta]) => ({ type, label: meta.label }))
})))

/**
 * Full text of one rule's trigger as shown on diagram edges and in summaries:
 * `if(hp < 25%)`, `while(hp < 25%) until(hp > 50%)`, `after 10s if(hp < 25%)`.
 */
export function describeRuleTrigger(transition) {
  const when = describeCondition(transition.when)
  if (transition.kind === 'after') return `after ${formatDelay(transition.delaySeconds)} if(${when})`
  const until = transition.kind === 'while' && transition.until ? ` until(${describeCondition(transition.until)})` : ''
  return `${transition.kind}(${when})${until}`
}

export { describeEffect }
