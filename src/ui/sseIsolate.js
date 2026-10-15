// Event-driven image processing only; no simulation/render-loop work.
export function isolateComponent(image, x, y, cutoff = 16) {
  const { width, height, data } = image
  x = Math.floor(x)
  y = Math.floor(y)
  if (!Number.isFinite(cutoff) || cutoff < 0 || cutoff > 255) throw new Error('Cutoff must be between 0 and 255.')
  const foreground = (index) => data[index * 4 + 3] > 0 && Math.max(data[index * 4], data[index * 4 + 1], data[index * 4 + 2]) > cutoff
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height || !foreground(y * width + x)) return null
  const visited = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 1
  queue[0] = y * width + x
  visited[queue[0]] = 1
  let left = x
  let right = x
  let top = y
  let bottom = y
  while (head < tail) {
    const index = queue[head++]
    const px = index % width
    const py = Math.floor(index / width)
    left = Math.min(left, px)
    right = Math.max(right, px)
    top = Math.min(top, py)
    bottom = Math.max(bottom, py)
    const visit = (next) => {
      if (!visited[next] && foreground(next)) {
        visited[next] = 1
        queue[tail++] = next
      }
    }
    if (px > 0) visit(index - 1)
    if (px + 1 < width) visit(index + 1)
    if (py > 0) visit(index - width)
    if (py + 1 < height) visit(index + width)
  }
  const bbox = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
  const pixels = new Uint8ClampedArray(bbox.width * bbox.height * 4)
  for (let i = 0; i < tail; i++) {
    const index = queue[i]
    const destination = ((Math.floor(index / width) - top) * bbox.width + index % width - left) * 4
    pixels.set(data.subarray(index * 4, index * 4 + 4), destination)
  }
  return { bbox, pixels, area: tail }
}
