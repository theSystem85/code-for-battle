import { showUpdateRecovery } from './pwa/updateRecovery.js'
import { checkStartupUpdate } from './pwa/startupUpdate.js'
import { showLoadingScreen, updateLoadingScreen, waitForLoadingPaint } from './ui/loadingScreen.js'
import { LAST_VERSION_KEY, readBootStorage, writeBootStorage } from './ui/releaseDigest.js'

async function rememberInstalledVersion() {
  const controller = navigator.serviceWorker?.controller
  if (!controller || readBootStorage(LAST_VERSION_KEY)) return
  // The predecessor (0.46.0) did not report its version. This is the migration baseline.
  const version = await new Promise(resolve => {
    const channel = new window.MessageChannel()
    const finish = value => {
      clearTimeout(timer)
      channel.port1.close()
      resolve(value)
    }
    const timer = setTimeout(() => finish('0.46.0'), 300)
    channel.port1.onmessage = event => finish(event.data?.version || '0.46.0')
    controller.postMessage({ type: 'GET_APP_VERSION' }, [channel.port2])
  })
  writeBootStorage(LAST_VERSION_KEY, version)
}

async function start() {
  // Delay all game imports until the HTML has parsed and update preflight completes.
  if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
  }
  showLoadingScreen({ phase: 'update-check', detail: 'Checking for updates', progress: null })
  await waitForLoadingPaint()
  await rememberInstalledVersion().catch(() => {})
  const reloading = await checkStartupUpdate({
    onStatus: detail => updateLoadingScreen({ detail })
  })
  if (reloading) return
  const game = await import('./main.js')
  await game.initializeApp()
  // Dev branch deploy and `npm run dev` only (see src/pwa/liveUpdate.js);
  // production builds drop this branch at build time.
  if (__LIVE_UPDATE__ || import.meta.env.DEV) {
    import('./pwa/liveUpdate.js')
      .then(({ startLiveUpdate }) => startLiveUpdate())
      .catch(error => console.warn('Live update unavailable', error))
  }
}

start().catch(error => {
  if (!showUpdateRecovery(error)) window.__cfbUpdateHandoff = false
  updateLoadingScreen({ phase: 'error', detail: 'Startup failed. Reload the page to try again.', progress: null })
  console.error('Game startup failed', error)
})
