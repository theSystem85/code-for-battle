// Derived from persisted age: old saves need no state migration. A fire grows
// every 20 simulation seconds; graphics quality never changes the simulation.
export function getFireSeverity(fire) {
  return Math.max(1, Math.min(5, 1 + Math.floor(Math.max(0, fire.age || 0) / 20)))
}
