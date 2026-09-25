export const COOP_CAMERA_MARGIN = 64

export function computeCoopCameraFocus({
  p1,
  p2,
  viewportWidth,
  viewportHeight,
  previousMode = 'p1',
  margin = COOP_CAMERA_MARGIN
}) {
  if (!p1) return { mode: 'none', focusX: null, focusY: null }
  if (!p2 || !viewportWidth || !viewportHeight) {
    return { mode: 'p1', focusX: p1.x, focusY: p1.y }
  }

  const dx = Math.abs(p2.x - p1.x)
  const dy = Math.abs(p2.y - p1.y)
  const enterLimitX = Math.max(0, viewportWidth - margin * 2)
  const enterLimitY = Math.max(0, viewportHeight - margin * 2)
  const enterFits = dx <= enterLimitX && dy <= enterLimitY
  const stayFits = dx <= viewportWidth && dy <= viewportHeight
  const viewLeft = p1.x - viewportWidth / 2
  const viewTop = p1.y - viewportHeight / 2
  const onP1Screen = p2.x >= viewLeft + margin &&
    p2.x <= viewLeft + viewportWidth - margin &&
    p2.y >= viewTop + margin &&
    p2.y <= viewTop + viewportHeight - margin

  let mode = previousMode === 'both' ? 'both' : 'p1'
  if (mode === 'both') mode = stayFits ? 'both' : 'p1'
  else if (enterFits && onP1Screen) mode = 'both'

  if (mode === 'both') {
    return { mode, focusX: (p1.x + p2.x) / 2, focusY: (p1.y + p2.y) / 2 }
  }
  return { mode: 'p1', focusX: p1.x, focusY: p1.y }
}

export function coopFocusToScroll(focusX, focusY, viewportWidth, viewportHeight, maxScrollX, maxScrollY) {
  const rawX = focusX - viewportWidth / 2
  const rawY = focusY - viewportHeight / 2
  return {
    x: Math.max(0, Math.min(rawX, Math.max(0, maxScrollX))),
    y: Math.max(0, Math.min(rawY, Math.max(0, maxScrollY)))
  }
}
