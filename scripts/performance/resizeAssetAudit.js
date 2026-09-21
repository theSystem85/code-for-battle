export function createResizeAuditScript() {
  return () => {
    const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage
    const originalCanvasWidth = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width')
    const originalCanvasHeight = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height')
    const resizeEvents = []
    const transformedDraws = []
    const recordCanvasResize = (property, value) => {
      resizeEvents.push({ property, value, timestamp: performance.now() })
    }
    Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
      configurable: true,
      get: originalCanvasWidth.get,
      set(value) { recordCanvasResize('width', value); originalCanvasWidth.set.call(this, value) }
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'height', {
      configurable: true,
      get: originalCanvasHeight.get,
      set(value) { recordCanvasResize('height', value); originalCanvasHeight.set.call(this, value) }
    })
    CanvasRenderingContext2D.prototype.drawImage = function auditedDrawImage(...args) {
      if (args.length >= 9 || args.length === 5) {
        const source = args[0]
        const destinationWidth = args.length >= 9 ? args[7] : args[3]
        const destinationHeight = args.length >= 9 ? args[8] : args[4]
        const sourceWidth = source?.naturalWidth || source?.videoWidth || source?.width || null
        const sourceHeight = source?.naturalHeight || source?.videoHeight || source?.height || null
        if (sourceWidth !== null && sourceHeight !== null && (sourceWidth !== destinationWidth || sourceHeight !== destinationHeight)) {
          transformedDraws.push({ sourceWidth, sourceHeight, destinationWidth, destinationHeight, timestamp: performance.now() })
        }
      }
      return originalDrawImage.apply(this, args)
    }
    return () => {
      CanvasRenderingContext2D.prototype.drawImage = originalDrawImage
      Object.defineProperty(HTMLCanvasElement.prototype, 'width', originalCanvasWidth)
      Object.defineProperty(HTMLCanvasElement.prototype, 'height', originalCanvasHeight)
      return { resizeEvents, transformedDraws }
    }
  }
}

export function summarizeAssetMetadata(entries = []) {
  const assets = entries.filter(entry => entry?.name || entry?.url).map(entry => ({
    name: entry.name || entry.url,
    url: entry.url || null,
    decodedBodySize: Number.isFinite(entry.decodedBodySize) ? entry.decodedBodySize : null,
    transferSize: Number.isFinite(entry.transferSize) ? entry.transferSize : null,
    durationMs: Number.isFinite(entry.durationMs) ? entry.durationMs : null
  }))
  return {
    assetCount: assets.length,
    decodedBytes: assets.reduce((sum, asset) => sum + (asset.decodedBodySize || 0), 0),
    transferBytes: assets.reduce((sum, asset) => sum + (asset.transferSize || 0), 0),
    assets
  }
}

