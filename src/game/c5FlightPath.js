// Cruise speed is measured in world pixels per tick. A fixed, bounded length
// table keeps speed consistent across curves and survives mission save/load.
const LENGTH_SAMPLES = 32

function cubic(start, first, last, end, t) {
  const rest = 1 - t
  return rest ** 3 * start + 3 * rest ** 2 * t * first + 3 * rest * t ** 2 * last + t ** 3 * end
}

function tangent(start, first, last, end, t) {
  const rest = 1 - t
  return rest ** 2 * (first - start) + 2 * rest * t * (last - first) + t ** 2 * (end - last)
}

export function createC5FlightPath(unit, x, y, endHeading) {
  const dx = x - unit.x
  const dy = y - unit.y
  const direct = Math.atan2(dy, dx)
  const heading = Number.isFinite(unit.direction) ? unit.direction : direct
  const distance = Math.hypot(dx, dy)
  const startHandle = Math.max(36, distance * 0.36)
  const endHandle = Math.max(24, distance * 0.32)
  const turnBack = Math.cos(direct - heading) < -0.85
  const arrival = endHeading ?? (turnBack ? direct - 0.7 : direct)
  const firstX = unit.x + Math.cos(heading) * startHandle
  const firstY = unit.y + Math.sin(heading) * startHandle
  const lastX = x - Math.cos(arrival) * endHandle
  const lastY = y - Math.sin(arrival) * endHandle

  const lengths = [0]
  let previousX = unit.x
  let previousY = unit.y
  for (let index = 1; index <= LENGTH_SAMPLES; index++) {
    const t = index / LENGTH_SAMPLES
    const sampleX = cubic(unit.x, firstX, lastX, x, t)
    const sampleY = cubic(unit.y, firstY, lastY, y, t)
    lengths.push(lengths[index - 1] + Math.hypot(sampleX - previousX, sampleY - previousY))
    previousX = sampleX
    previousY = sampleY
  }
  return { startX: unit.x, startY: unit.y, firstX, firstY, lastX, lastY, x, y, lengths, traveled: 0, index: 1 }
}

export function advanceC5FlightPath(unit, path, speed) {
  const length = path.lengths[LENGTH_SAMPLES]
  path.traveled = Math.min(length, path.traveled + speed)
  while (path.index < LENGTH_SAMPLES && path.lengths[path.index] < path.traveled) path.index++
  const span = path.lengths[path.index] - path.lengths[path.index - 1]
  const part = span > 0 ? (path.traveled - path.lengths[path.index - 1]) / span : 1
  const t = (path.index - 1 + part) / LENGTH_SAMPLES
  const dx = tangent(path.startX, path.firstX, path.lastX, path.x, t)
  const dy = tangent(path.startY, path.firstY, path.lastY, path.y, t)
  if (Math.hypot(dx, dy) > 0.001) unit.direction = Math.atan2(dy, dx)
  unit.x = cubic(path.startX, path.firstX, path.lastX, path.x, t)
  unit.y = cubic(path.startY, path.firstY, path.lastY, path.y, t)
  return path.traveled >= length
}
