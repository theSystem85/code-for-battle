// Mine layers and mine sweepers cross mines placed by their own faction.
// Other unit types still trigger those mines, and enemy mines still trigger everyone.

const OWN_MINE_SAFE_TYPES = new Set(['mineLayer', 'mineSweeper'])

function factionOwner(owner) {
  return owner === 'player' ? 'player1' : owner
}

export function unitIgnoresOwnMines(unit) {
  return Boolean(unit && OWN_MINE_SAFE_TYPES.has(unit.type))
}

export function unitCrossesOwnMineSafely(unit, mine) {
  if (!unitIgnoresOwnMines(unit) || !mine) return false
  const unitOwner = unit.owner
  const mineOwner = mine.owner
  if (!unitOwner || !mineOwner) return false
  return factionOwner(unitOwner) === factionOwner(mineOwner)
}

/**
 * Path requests that carry the unit type on the start node skip friendly mines
 * for mine layers and sweepers. Copies options only for those two types.
 * @param {object|null} start
 * @param {object|null} options
 * @returns {object|null}
 */
export function pathOptionsIgnoringOwnMines(start, options) {
  if (!options?.ignoreFriendlyMines && unitIgnoresOwnMines(start)) {
    return { ...(options || {}), ignoreFriendlyMines: true }
  }
  return options
}
