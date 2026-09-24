const GIBIBYTE = 1024 ** 3
const MEBIBYTE = 1024 ** 2
const KIBIBYTE = 1024

export const VRAM_LIMIT_TITLE = 'Maximum single-buffer size reported by WebGPU (maxBufferSize), not true video memory.'

export function estimateTextureBytes({
  width = 0,
  height = 0,
  bytesPerPixel = 4,
  mipLevels = 1,
  layers = 1
} = {}) {
  const pixelsWide = Math.max(0, Number(width) || 0)
  const pixelsHigh = Math.max(0, Number(height) || 0)
  const bytesPerTexel = Math.max(0, Number(bytesPerPixel) || 0)
  const mips = Math.max(1, Number(mipLevels) || 1)
  const layerCount = Math.max(1, Number(layers) || 1)
  return pixelsWide * pixelsHigh * bytesPerTexel * mips * layerCount
}

export function formatGpuBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'n/a'
  const gigabytes = bytes / GIBIBYTE
  if (gigabytes >= 0.95) return `${(Math.round(gigabytes * 10) / 10).toFixed(1)} GB`
  if (bytes >= MEBIBYTE) return `${(bytes / MEBIBYTE).toFixed(1)} MB`
  if (bytes >= KIBIBYTE) return `${(bytes / KIBIBYTE).toFixed(1)} KB`
  return `${Math.round(bytes)} B`
}

export function formatVramLabel(maxBufferSize) {
  if (!Number.isFinite(maxBufferSize) || maxBufferSize <= 0) return 'VRAM: n/a'
  return `VRAM: ${formatGpuBytes(maxBufferSize)}`
}

export function formatVramInUse(bytes, maxBufferSize) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'VRAM in use: n/a'
  const used = formatGpuBytes(bytes)
  if (!Number.isFinite(maxBufferSize) || maxBufferSize <= 0) return `VRAM in use: ${used}`
  const percent = (bytes / maxBufferSize) * 100
  const percentText = percent >= 10 ? percent.toFixed(0) : percent.toFixed(1)
  return `VRAM in use: ${used} / ${formatGpuBytes(maxBufferSize)} (${percentText}%)`
}

/**
 * Resident bytes for GPU buffers and textures this renderer allocated.
 * `track` is idempotent for an unchanged size so hot paths can call it
 * without reallocating the accounting map.
 */
export class GpuMemoryTracker {
  constructor() {
    this.bytesByResource = new Map()
    this.bytesInUse = 0
  }

  track(resource, bytes) {
    if (!resource) return this.bytesInUse
    const next = Math.max(0, Number(bytes) || 0)
    const previous = this.bytesByResource.get(resource) || 0
    if (previous === next) return this.bytesInUse
    this.bytesInUse += next - previous
    this.bytesByResource.set(resource, next)
    return this.bytesInUse
  }

  release(resource) {
    if (!resource || !this.bytesByResource.has(resource)) return this.bytesInUse
    this.bytesInUse -= this.bytesByResource.get(resource)
    this.bytesByResource.delete(resource)
    if (this.bytesInUse < 0) this.bytesInUse = 0
    return this.bytesInUse
  }

  reset() {
    this.bytesByResource.clear()
    this.bytesInUse = 0
    return this.bytesInUse
  }
}
