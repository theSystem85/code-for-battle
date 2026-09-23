// Tiny dispatcher so naval damage sites can reach attack narration
// without importing the input/UI notification module (that import cycles).
let dispatchAttackAlert = () => {}

export function registerAttackAlertDispatcher(dispatcher) {
  dispatchAttackAlert = typeof dispatcher === 'function' ? dispatcher : () => {}
}

export function notifyEntityUnderAttack(target, attacker, now) {
  dispatchAttackAlert(target, attacker, now)
}
