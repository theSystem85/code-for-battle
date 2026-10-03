// Remembers the last hit a unit took so unit policies can ask whether it got a
// direct or an indirect hit, and from a unit or a building. One small object per
// unit, mutated in place; nothing here changes damage or targeting.

const INDIRECT_SHOOTER_TYPES = new Set(['howitzer', 'artilleryTurret'])

export function isIndirectShooter(shooter) {
  return Boolean(shooter) && INDIRECT_SHOOTER_TYPES.has(shooter.type)
}

/**
 * @param {object} target unit that took the hit
 * @param {object} shooter unit or building that caused it
 * @param {boolean} direct true for a projectile impact, false for splash or artillery
 * @param {number} now simulation time
 */
export function recordUnitHit(target, shooter, direct, now) {
  if (!target || !shooter) return
  let hit = target.lastHit
  if (!hit) {
    hit = { time: 0, direct: false, attacker: null, byBuilding: false }
    Object.defineProperty(target, 'lastHit', { value: hit, enumerable: false, writable: true, configurable: true })
  }
  hit.time = now
  hit.direct = direct
  hit.attacker = shooter
  hit.byBuilding = shooter.isBuilding === true || typeof shooter.tileX !== 'number'
}
