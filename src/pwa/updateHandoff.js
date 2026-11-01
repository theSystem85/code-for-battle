import { isSeamlessUpdateEnabled } from './seamlessUpdateSettings.js'
import { downloadOfflineAssets, readCachedAsset } from './offlineAssetDownload.js'
import { OFFLINE_ASSET_FILL_HEADER } from './offlineAssetPlan.js'

export const UPDATE_CACHE_PREFIX = 'cfb-update-'
export const UPDATE_QUERY = 'cfb-update'
export const UPDATE_FRAME_KEY = 'cfb-update-frame'
const UPDATE_FRAME_SCALES = [1, 0.75, 0.5, 0.35, 0.25, 0.18, 0.125, 0.08, 0.05]

// A separate cache prevents staging from replacing imagery used by the live game.
export async function stageGameUpdate(info, { win = window, fetchImpl = (...args) => win.fetch(...args), onProgress } = {}) {
  if (!win.navigator?.serviceWorker?.controller || !win.caches) throw new Error('Updates require an active service worker. Reload the page once and try again.')
  const response = await fetchImpl('/game-update-manifest.json', { cache: 'no-store' })
  if (!response.ok) throw new Error('Could not download the update manifest')
  const manifest = await response.json()
  if (manifest.commit !== info.commit || !manifest.assets?.length) throw new Error('The deploy changed. Check for updates again.')
  const cacheName = `${UPDATE_CACHE_PREFIX}${info.commit}`
  const cache = await win.caches.open(cacheName)
  const reusable = (await win.caches.keys()).filter(name => name !== cacheName
    && (name.startsWith(UPDATE_CACHE_PREFIX) || name === 'cfb-offline-assets-v1'))
  const sources = await Promise.all(reusable.map(name => win.caches.open(name)))
  const result = await downloadOfflineAssets({
    assets: manifest.assets,
    cache,
    concurrency: 2,
    fetchImpl: async(url, asset) => {
      for (const source of sources) {
        const cached = await readCachedAsset(source, url)
        if (cached?.revision === asset.revision) return cached.response
      }
      return fetchImpl(url, { cache: 'no-store', headers: { [OFFLINE_ASSET_FILL_HEADER]: '1' } })
    },
    onProgress
  })
  if (!result.complete) throw new Error('Update download incomplete. Your game is still running; try again.')
  const current = await fetchImpl('/build-info.json', { cache: 'no-store' })
  if (!current.ok || (await current.json()).commit !== info.commit) throw new Error('The deploy changed during download. Try again.')
  return cacheName
}

export function showUpdateFrame(frame, { doc = document } = {}) {
  doc.getElementById('gameUpdateFrame')?.remove()
  const root = doc.createElement('div')
  root.id = 'gameUpdateFrame'
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#182126;pointer-events:auto;'
  for (const layer of frame.layers) {
    const image = doc.createElement('img')
    image.src = layer.src
    image.alt = ''
    image.style.cssText = `position:absolute;left:${layer.x}px;top:${layer.y}px;width:${layer.width}px;height:${layer.height}px;`
    root.appendChild(image)
  }
  doc.getElementById('liveUpdateProgress')?.remove()
  const bar = doc.createElement('progress')
  bar.id = 'liveUpdateProgress'
  bar.max = 1
  bar.setAttribute('aria-label', 'Restoring updated game')
  bar.style.cssText = 'position:absolute;top:env(safe-area-inset-top,0px);left:0;width:100%;height:5px;margin:0;accent-color:#e9b44c;'
  root.appendChild(bar)
  doc.body.appendChild(root)
  return root
}

// Called once, while paused, immediately after a fresh render so GPU canvas
// buffers have not been discarded. No capture work is added to the frame loop.
function captureCanvasLayer(canvas, scale, doc) {
  if (scale === 1) return canvas.toDataURL('image/webp', 0.85)
  const snapshot = doc.createElement('canvas')
  snapshot.width = Math.max(1, Math.round(canvas.width * scale))
  snapshot.height = Math.max(1, Math.round(canvas.height * scale))
  const context = snapshot.getContext('2d')
  if (!context) throw new Error('Could not create the update snapshot')
  context.drawImage(canvas, 0, 0, snapshot.width, snapshot.height)
  return snapshot.toDataURL('image/webp', 0.8)
}

function collectUpdateFrame({ win, doc, commit, scale }) {
  const layers = []
  for (const id of ['gameCanvasGL', 'gameCanvasGPU', 'gameCanvas', 'minimap']) {
    const canvas = doc.getElementById(id)
    if (!canvas || !canvas.width || !canvas.height || win.getComputedStyle(canvas).display === 'none') continue
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) continue
    layers.push({ src: captureCanvasLayer(canvas, scale, doc), x: rect.x, y: rect.y, width: rect.width, height: rect.height })
  }
  if (!layers.length) throw new Error('Could not preserve the battlefield view')
  return { layers, commit, createdAt: Date.now() }
}

export function captureUpdateFrame({ win = window, doc = document, commit } = {}) {
  let quotaError
  for (const scale of UPDATE_FRAME_SCALES) {
    const frame = collectUpdateFrame({ win, doc, commit, scale })
    try {
      // Canvas snapshots can exceed Safari's small per-value storage limit on
      // Retina displays. Retry at bounded resolutions rather than abandoning
      // the already-saved match and falling back to the loading screen.
      win.sessionStorage.setItem(UPDATE_FRAME_KEY, JSON.stringify(frame))
      showUpdateFrame(frame, { doc })
      return frame
    } catch (error) {
      quotaError = error
      try { win.sessionStorage.removeItem(UPDATE_FRAME_KEY) } catch { /* Retry with a smaller snapshot. */ }
      if (error?.name !== 'QuotaExceededError') throw error
    }
  }
  throw quotaError || new Error('Could not persist the update snapshot')
}

export function clearUpdateFrame({ win = window, doc = document } = {}) {
  try { win.sessionStorage?.removeItem(UPDATE_FRAME_KEY) } catch { /* Recovery must also work when storage is full or blocked. */ }
  doc.getElementById('gameUpdateFrame')?.remove()
}

export async function prepareRunningGameUpdate(info) {
  const [{ gameState }, { prepareForLiveUpdateReload }] = await Promise.all([
    import('../gameState.js'), import('../saveGame.js')
  ])
  const saved = await prepareForLiveUpdateReload()
  if (gameState.gameStarted && !gameState.gameOver && !saved) throw new Error('Could not save the running game')
  if (saved && isSeamlessUpdateEnabled()) {
    const { getCurrentGame } = await import('../game/gameOrchestrator.js')
    getCurrentGame()?.gameLoop?.renderUpdateSnapshot()
    captureUpdateFrame({ commit: info?.commit })
  }
}
