// Age grows every 20 simulation seconds. Successful spread into a burning
// tile adds a level without advancing that fire's burn time.
export function getFireSeverity(fire) {
  return Math.max(1, Math.min(5, 1 + (fire.spreadBoost || 0) + Math.floor(Math.max(0, fire.age || 0) / 20)))
}
