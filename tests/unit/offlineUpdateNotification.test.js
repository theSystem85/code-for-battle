import { afterEach, describe, expect, it, vi } from 'vitest'

let controller
const previousGameState = window.gameState
afterEach(() => {
  controller?.stop()
  window.gameState = previousGameState
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('available update notification', () => {
  for (const target of ['sidebar', 'notification', 'history']) {
    it(`[U03196] applies the waiting worker and reloads once from the ${target} action`, async() => {
      vi.resetModules()
      vi.stubEnv('PROD', true)
      vi.useFakeTimers()
      document.body.innerHTML = `<div id="sidebar"><div class="sidebar-status-row">
        <div id="offlineUpdatePrompt" hidden><button id="offlineUpdateReload" data-offline-update-label></button></div>
        <button id="offlineModeButton"><span data-offline-label></span></button>
      </div></div>`
      window.gameState = { gameStarted: true, gameOver: false }
      const worker = new window.EventTarget()
      worker.postMessage = vi.fn()
      const registration = new window.EventTarget()
      registration.waiting = worker
      const serviceWorker = new window.EventTarget()
      serviceWorker.controller = {}
      serviceWorker.register = vi.fn(async() => registration)
      serviceWorker.ready = new Promise(() => {})
      const events = new window.EventTarget()
      const reload = vi.fn()
      const win = {
        document, navigator: { onLine: true, serviceWorker }, sessionStorage,
        location: { href: 'http://localhost/', reload },
        addEventListener: events.addEventListener.bind(events),
        removeEventListener: events.removeEventListener.bind(events)
      }
      const { startOfflineMode } = await import('../../src/pwa/offlineController.js')
      controller = startOfflineMode({ window: win, fetchImpl: async() => ({ ok: false }) })
      await vi.waitFor(() => expect(document.getElementById('offlineUpdatePrompt').hidden).toBe(false))
      registration.dispatchEvent(new Event('updatefound'))
      await controller.refreshProbe()
      expect(document.querySelectorAll('.notification__inline-link')).toHaveLength(1)
      expect(worker.postMessage).not.toHaveBeenCalled()
      let action
      if (target === 'sidebar') action = document.getElementById('offlineUpdateReload')
      else if (target === 'notification') action = document.querySelector('.notification__inline-link')
      else {
        await vi.advanceTimersByTimeAsync(6500)
        expect(document.querySelector('.notification')).toBeNull()
        const { toggleNotificationPanel } = await import('../../src/ui/notificationHistory.js')
        toggleNotificationPanel(true)
        expect(document.querySelectorAll('.notif-history__item')).toHaveLength(1)
        action = document.querySelector('.notif-history__item')
      }
      action.click()
      action.click()
      expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'SKIP_WAITING' })
      expect(reload).not.toHaveBeenCalled()
      serviceWorker.dispatchEvent(new Event('controllerchange'))
      serviceWorker.dispatchEvent(new Event('controllerchange'))
      expect(reload).toHaveBeenCalledOnce()
      expect(document.getElementById('offlineUpdatePrompt').hidden).toBe(true)
    })
  }
})
