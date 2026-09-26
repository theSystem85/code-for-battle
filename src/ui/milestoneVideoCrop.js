// Per-clip content rectangles for milestone videos.
// Several masters bake black pillarbox bars into the frame. The radar draw
// uses only the picture area and stretches that to the full minimap.
// Lookup is a frozen table. The renderer writes into one reused rect.

const BLACK_THRESHOLD = 12
const MIN_BAR_PX = 4

const SQUARE_PILLAR = Object.freeze({
  x: 192,
  y: 0,
  width: 576,
  height: 576,
  frameWidth: 960,
  frameHeight: 576
})

export const MILESTONE_VIDEO_CROPS = Object.freeze({
  first_tank: Object.freeze({
    x: 52,
    y: 0,
    width: 854,
    height: 576,
    frameWidth: 960,
    frameHeight: 576
  }),
  air_strip: SQUARE_PILLAR,
  first_artillery: SQUARE_PILLAR,
  first_mine_layer: SQUARE_PILLAR,
  first_mine_sweeper: SQUARE_PILLAR,
  first_rocket_tank: SQUARE_PILLAR
})

const detectedByVideo = new WeakMap()
let detectCanvas = null
let detectCtx = null

function isDark(data, offset, threshold) {
  return data[offset] <= threshold && data[offset + 1] <= threshold && data[offset + 2] <= threshold
}

export function milestoneBaseFromVideo(video) {
  const marked = video?.dataset?.milestoneBase
  if (marked) return String(marked)
  const src = video?.currentSrc || video?.src || ''
  if (!src) return ''
  const path = String(src).split('?')[0].split('#')[0]
  const slash = path.lastIndexOf('/')
  const file = slash >= 0 ? path.slice(slash + 1) : path
  return file.replace(/\.mp4$/i, '')
}

/**
 * Content box inside an RGBA frame. Near-black borders on a few sample rows
 * and columns are excluded. Insets under MIN_BAR_PX stay in the frame so a
 * compression fringe is not cropped. Returns null when the frame has no bar.
 */
export function contentRectFromRgba(data, width, height, threshold = BLACK_THRESHOLD) {
  if (!data || width < 2 || height < 2) return null
  const rows = [height >> 2, height >> 1, (height * 3) >> 2]
  const cols = [width >> 2, width >> 1, (width * 3) >> 2]
  let left = width
  let right = -1
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] * width * 4
    let x = 0
    while (x < width && isDark(data, row + x * 4, threshold)) x++
    let edge = width - 1
    while (edge >= x && isDark(data, row + edge * 4, threshold)) edge--
    if (x < left) left = x
    if (edge > right) right = edge
  }
  let top = height
  let bottom = -1
  for (let i = 0; i < cols.length; i++) {
    const x = cols[i]
    let y = 0
    while (y < height && isDark(data, (y * width + x) * 4, threshold)) y++
    let edge = height - 1
    while (edge >= y && isDark(data, (edge * width + x) * 4, threshold)) edge--
    if (y < top) top = y
    if (edge > bottom) bottom = edge
  }
  if (right < left || bottom < top) return null
  const barLeft = left
  const barRight = width - 1 - right
  const barTop = top
  const barBottom = height - 1 - bottom
  if (barLeft < MIN_BAR_PX && barRight < MIN_BAR_PX && barTop < MIN_BAR_PX && barBottom < MIN_BAR_PX) {
    return null
  }
  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1
  }
}

function detectMilestoneContentRect(video) {
  const width = video.videoWidth | 0
  const height = video.videoHeight | 0
  if (width < 2 || height < 2) return null
  if (typeof document === 'undefined' || video.nodeName !== 'VIDEO') return null
  if (!detectCanvas) {
    detectCanvas = document.createElement('canvas')
    detectCtx = detectCanvas.getContext('2d', { willReadFrequently: true })
  }
  if (!detectCtx) return null
  if (detectCanvas.width !== width) detectCanvas.width = width
  if (detectCanvas.height !== height) detectCanvas.height = height
  try {
    detectCtx.drawImage(video, 0, 0, width, height)
    const image = detectCtx.getImageData(0, 0, width, height)
    return contentRectFromRgba(image.data, width, height)
  } catch {
    return null
  }
}

function applyConfiguredCrop(out, crop, videoWidth, videoHeight) {
  let x = crop.x
  let y = crop.y
  let width = crop.width
  let height = crop.height
  if (videoWidth !== crop.frameWidth || videoHeight !== crop.frameHeight) {
    const scaleX = videoWidth / crop.frameWidth
    const scaleY = videoHeight / crop.frameHeight
    x = Math.round(crop.x * scaleX)
    y = Math.round(crop.y * scaleY)
    width = Math.round(crop.width * scaleX)
    height = Math.round(crop.height * scaleY)
  }
  if (x < 0 || y < 0 || width < 1 || height < 1 || x + width > videoWidth || y + height > videoHeight) {
    out.x = 0
    out.y = 0
    out.width = videoWidth
    out.height = videoHeight
    return
  }
  out.x = x
  out.y = y
  out.width = width
  out.height = height
}

/**
 * Writes the source rectangle for drawImage into `out` and returns `out`.
 * Configured clips use the manifest. Other clips detect black borders once
 * and reuse that result. No object is allocated on later frames.
 */
export function writeMilestoneVideoSourceRect(out, video) {
  const videoWidth = video && video.videoWidth > 0 ? video.videoWidth : 0
  const videoHeight = video && video.videoHeight > 0 ? video.videoHeight : 0
  out.x = 0
  out.y = 0
  out.width = videoWidth
  out.height = videoHeight
  if (!video || videoWidth < 1 || videoHeight < 1) return out

  const base = milestoneBaseFromVideo(video)
  const configured = base ? MILESTONE_VIDEO_CROPS[base] : null
  if (configured) {
    applyConfiguredCrop(out, configured, videoWidth, videoHeight)
    return out
  }

  let entry = detectedByVideo.get(video)
  if (!entry || entry.base !== base || entry.videoWidth !== videoWidth || entry.videoHeight !== videoHeight) {
    entry = {
      base,
      videoWidth,
      videoHeight,
      crop: detectMilestoneContentRect(video)
    }
    detectedByVideo.set(video, entry)
  }
  if (entry.crop) {
    out.x = entry.crop.x
    out.y = entry.crop.y
    out.width = entry.crop.width
    out.height = entry.crop.height
  }
  return out
}
