export function appendMoveWaypoint(units, x, y) {
  for (const unit of units) {
    unit.commandQueue ??= []
    unit.commandQueue.push({ type: 'move', x, y })
  }
}
