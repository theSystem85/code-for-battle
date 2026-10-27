import { isSeamlessUpdateEnabled } from './seamlessUpdateSettings.js'
import { downloadOfflineAssets, readCachedAsset } from './offlineAssetDownload.js'
import { OFFLINE_ASSET_FILL_HEADER } from './offlineAssetPlan.js'

export const UPDATE_CACHE_PREFIX = 'cfb-update-'
export const UPDATE_QUERY = 'cfb-update'
export const UPDATE_FRAME_KEY = 'cfb-update-frame'

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
  const label = doc.createElement('div')
  label.textContent = 'Paused · Applying update'
  label.setAttribute('role', 'status')
  label.style.cssText = 'position:absolute;top:20px;left:50%;transform:translateX(-50%);padding:12px 20px;background:#182126;color:white;font:18px sans-serif;border-radius:8px;'
  root.appendChild(label)
  doc.body.appendChild(root)
  return root
}

// Called once, while paused, immediately after a fresh render so GPU canvas
// buffers have not been discarded. No capture work is added to the frame loop.
export function captureUpdateFrame({ win = window, doc = document } = {}) {
  const layers = []
  for (const id of ['gameCanvasGL', 'gameCanvasGPU', 'gameCanvas', 'minimap']) {
    const canvas = doc.getElementById(id)
    if (!canvas || !canvas.width || !canvas.height || win.getComputedStyle(canvas).display === 'none') continue
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) continue
    layers.push({ src: canvas.toDataURL('image/webp', 0.85), x: rect.x, y: rect.y, width: rect.width, height: rect.height })
  }
  if (!layers.length) throw new Error('Could not preserve the battlefield view')
  const frame = { layers, createdAt: Date.now() }
  win.sessionStorage.setItem(UPDATE_FRAME_KEY, JSON.stringify(frame))
  showUpdateFrame(frame, { doc })
}

export function clearUpdateFrame({ win = window, doc = document } = {}) {
  try { win.sessionStorage?.removeItem(UPDATE_FRAME_KEY) } catch { /* Recovery must also work when storage is full or blocked. */ }
  doc.getElementById('gameUpdateFrame')?.remove()
}

export async function prepareRunningGameUpdate() {
  const [{ gameState }, { prepareForLiveUpdateReload }] = await Promise.all([
    import('../gameState.js'), import('../saveGame.js')
  ])
  const saved = await prepareForLiveUpdateReload()
  if (gameState.gameStarted && !gameState.gameOver && !saved) throw new Error('Could not save the running game')
  if (saved && isSeamlessUpdateEnabled()) {
    const { getCurrentGame } = await import('../game/gameOrchestrator.js')
    getCurrentGame()?.gameLoop?.renderUpdateSnapshot()
    captureUpdateFrame()
  }
}
