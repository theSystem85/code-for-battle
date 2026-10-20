// Keep keyboard cancellation independent of the production/game module graph.
let cancelHandler = null

export function bindStackedPlacementCancellation(handler) {
  cancelHandler = handler
}

export function cancelStackedPlacement() {
  cancelHandler?.()
}
