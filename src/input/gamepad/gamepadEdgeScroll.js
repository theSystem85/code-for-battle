export const GAMEPAD_EDGE_MARGIN = 20

export function writeGamepadEdgeScroll(out, x, y, width, height, margin = GAMEPAD_EDGE_MARGIN) {
  let sx = 0
  let sy = 0
  if (width > margin * 2) {
    if (x < margin) sx = -((margin - x) / margin)
    else if (x > width - margin) sx = (x - (width - margin)) / margin
  }
  if (height > margin * 2) {
    if (y < margin) sy = -((margin - y) / margin)
    else if (y > height - margin) sy = (y - (height - margin)) / margin
  }
  if (sx > 1) sx = 1
  else if (sx < -1) sx = -1
  if (sy > 1) sy = 1
  else if (sy < -1) sy = -1
  out.x = sx
  out.y = sy
  return out
}
