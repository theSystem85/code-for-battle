// Flat condition rows used by the block builder. A condition is shown as
// "all of" or "any of" a list of blocks, each block optionally negated. Deeper
// conditions (hand-written JSON) are shown read-only as text.

export const ATOM_KINDS = Object.freeze([
  { id: 'hp', label: 'Hit points' },
  { id: 'enemyDistance', label: 'Nearest enemy (tiles)' },
  { id: 'enemyInRange', label: 'Enemy in weapon range' },
  { id: 'underFire', label: 'Recently under fire' },
  { id: 'always', label: 'Always' }
])

export function atomKind(atom) {
  if (atom.type === 'compare') return atom.field
  return atom.type
}

function isAtom(condition) {
  return condition && ['always', 'compare', 'enemyInRange', 'underFire'].includes(condition.type)
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

export function makeAtom(kind) {
  switch (kind) {
    case 'hp': return { type: 'compare', field: 'hp', op: '<', value: 0.25 }
    case 'enemyDistance': return { type: 'compare', field: 'enemyDistance', op: '<', value: 6 }
    case 'enemyInRange': return { type: 'enemyInRange' }
    case 'underFire': return { type: 'underFire' }
    default: return { type: 'always' }
  }
}

function describeAtom(atom) {
  switch (atom.type) {
    case 'always': return 'always'
    case 'enemyInRange': return 'an enemy is in range'
    case 'underFire': return 'the unit is under fire'
    case 'compare':
      if (atom.field === 'hp') return `HP ${atom.op} ${Math.round(atom.value * 100)}%`
      return `nearest enemy ${atom.op} ${atom.value} tiles`
    default: return 'condition'
  }
}

export function describeCondition(condition) {
  if (!condition) return 'always'
  if (isAtom(condition)) return describeAtom(condition)
  if (condition.type === 'not') return `not (${describeCondition(condition.of)})`
  if (condition.type === 'and' || condition.type === 'or') {
    return condition.of.map(describeCondition).join(condition.type === 'and' ? ' and ' : ' or ')
  }
  return 'condition'
}

export const EFFECT_LABELS = Object.freeze({
  attackNearestEnemy: 'Attack nearest enemy',
  retreat: 'Retreat to base',
  hold: 'Hold position'
})
