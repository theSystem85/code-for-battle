export const SPRITE_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'stretch']

// Coordinates are relative to the reserved area. Contain never enlarges the
// requested sprite dimensions; stretch deliberately fills the entire area.
export function fitSprite(width, height, areaWidth, areaHeight, anchor = 'center') {
  if (![width, height, areaWidth, areaHeight].every(value => Number.isFinite(value) && value > 0)
    || !SPRITE_ANCHORS.includes(anchor)) throw new Error('Invalid sprite fit.')
  if (anchor === 'stretch') return { x: 0, y: 0, width: areaWidth, height: areaHeight }
  const scale = Math.min(1, areaWidth / width, areaHeight / height)
  const fittedWidth = width * scale
  const fittedHeight = height * scale
  const x = anchor.endsWith('right') ? areaWidth - fittedWidth : anchor === 'center' ? (areaWidth - fittedWidth) / 2 : 0
  const y = anchor.startsWith('bottom') ? areaHeight - fittedHeight : anchor === 'center' ? (areaHeight - fittedHeight) / 2 : 0
  return { x, y, width: fittedWidth, height: fittedHeight }
}

export function resetSourceImports(source) {
  source?.isolated.clear()
  source?.masks.clear()
}
