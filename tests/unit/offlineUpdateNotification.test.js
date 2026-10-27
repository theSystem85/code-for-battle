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
  it('[U05400] leaves a waiting worker silent when live updates own deploy notices', async() => {
    vi.resetModules()
    vi.stubEnv('PROD', true)
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
    const win = {
      document, navigator: { onLine: true, serviceWorker }, sessionStorage,
      location: { href: 'http://localhost/', reload: vi.fn() },
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events)
    }
    const { startOfflineMode } = await import('../../src/pwa/offlineController.js')
    controller = startOfflineMode({
      window: win,
      fetchImpl: async() => ({ ok: false }),
      liveUpdateEnabled: true
    })

    await controller.refreshProbe()

    expect(document.getElementById('offlineUpdatePrompt').hidden).toBe(true)
    expect(document.querySelector('.notification__inline-link')).toBeNull()
    expect(worker.postMessage).not.toHaveBeenCalled()
    expect(win.location.reload).not.toHaveBeenCalled()
  })

  for (const target of ['sidebar', 'notification', 'history']) {
    it(`[U03196] starts one background battle update from the ${target} action`, async() => {
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
      let completeUpdate
      const pendingUpdate = new Promise(resolve => { completeUpdate = resolve })
      const applyGameUpdate = vi.fn(() => pendingUpdate)
      controller = startOfflineMode({ window: win, fetchImpl: async() => ({ ok: false }), applyGameUpdate })
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
      expect(applyGameUpdate).toHaveBeenCalledOnce()
      expect(worker.postMessage).not.toHaveBeenCalled()
      expect(reload).not.toHaveBeenCalled()
      completeUpdate()
      await vi.advanceTimersByTimeAsync(0)
      expect(reload).not.toHaveBeenCalled()
      expect(document.getElementById('offlineUpdatePrompt').hidden).toBe(false)
    })
  }
})
