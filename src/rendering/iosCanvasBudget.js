// iPhone 13 Pro Max is 428×926 CSS pixels at devicePixelRatio 3. WebKit drops
// every canvas backing store once their combined pixels cross its total canvas
// memory limit (the console warning is "Total canvas memory use exceeds the
// maximum limit") and the tab is then a candidate for jetsam. Three full-screen
// game canvases at that DPR are already ~43 MB before terrain pages, glow
// caches and track marks. Capping iOS backing stores at 2× keeps the same three
// canvases near 19 MB and leaves room for the shoreline pages.

export const IOS_CANVAS_MEMORY_LIMIT_BYTES = 224 * 1024 * 1024
export const IOS_MAX_CANVAS_PIXEL_RATIO = 2
export const IOS_TERRAIN_RESIDENT_BUDGET_BYTES = 96 * 1024 * 1024

export function isIosWebKit(nav = globalThis.navigator) {
  const ua = String(nav?.userAgent || '')
  const platform = String(nav?.platform || '')
  const touch = Number(nav?.maxTouchPoints) || 0
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  return platform === 'MacIntel' && touch > 1
}

export function chunkCanvasBytes(logicalPixels, density) {
  const edge = Math.ceil(logicalPixels * Math.max(1, density || 1))
  return edge * edge * 4
}

export function terrainCacheLimits({
  logicalChunkPixels,
  density = 1,
  maxCachedChunks,
  ios = false
}) {
  const pageBytes = chunkCanvasBytes(logicalChunkPixels, density)
  if (!ios) {
    return {
      residentBytes: pageBytes * maxCachedChunks * 2,
      stagingBytes: pageBytes,
      maxCachedChunks
    }
  }
  const layers = 2
  const affordable = Math.max(4, Math.floor(IOS_TERRAIN_RESIDENT_BUDGET_BYTES / (pageBytes * layers)))
  const cappedChunks = Math.min(maxCachedChunks, affordable)
  return {
    residentBytes: pageBytes * cappedChunks * layers,
    stagingBytes: pageBytes,
    maxCachedChunks: cappedChunks
  }
}
