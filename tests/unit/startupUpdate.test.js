import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkStartupUpdate, UPDATE_RELOAD_GUARD } from '../../src/pwa/startupUpdate.js'

function setup({ waiting = true, installing = false, activate = true } = {}) {
  const serviceWorker = new window.EventTarget()
  const worker = new window.EventTarget()
  worker.state = 'installing'
  worker.postMessage = vi.fn(() => {
    if (activate) window.queueMicrotask(() => serviceWorker.dispatchEvent(new Event('controllerchange')))
  })
  const registration = {
    waiting: waiting ? worker : null,
    installing: installing ? worker : null,
    update: vi.fn(async() => {})
  }
  serviceWorker.controller = {}
  serviceWorker.register = vi.fn(async() => registration)
  const store = new Map()
  const win = {
    navigator: { onLine: true, serviceWorker },
    sessionStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
    location: { reload: vi.fn() }
  }
  return { win, worker, registration, store }
}

afterEach(() => vi.useRealTimers())

describe('startup update preflight', () => {
  it('[U04205] checks explicitly, activates a waiting update, and reloads before game startup', async() => {
    const { win, worker, registration, store } = setup()
    const status = vi.fn()
    expect(await checkStartupUpdate({ win, enabled: true, onStatus: status })).toBe(true)
    expect(registration.update).toHaveBeenCalledOnce()
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(win.location.reload).toHaveBeenCalledOnce()
    expect(store.get(UPDATE_RELOAD_GUARD)).toBe('1')
    expect(status).toHaveBeenLastCalledWith('Installing update')
  })

  it('[U04206] waits for an update found during the check to finish installing', async() => {
    const { win, worker, registration } = setup({ waiting: false })
    registration.update.mockImplementation(async() => {
      registration.installing = worker
      setTimeout(() => {
        worker.state = 'installed'
        registration.waiting = worker
        worker.dispatchEvent(new Event('statechange'))
      }, 5)
    })
    expect(await checkStartupUpdate({ win, enabled: true })).toBe(true)
    expect(win.location.reload).toHaveBeenCalledOnce()
  })

  it('[U04207] allows game startup when offline, unchanged, or registration fails', async() => {
    const { win } = setup({ waiting: false })
    expect(await checkStartupUpdate({ win, enabled: true })).toBe(false)
    win.navigator.onLine = false
    win.navigator.serviceWorker.register.mockClear()
    expect(await checkStartupUpdate({ win, enabled: true })).toBe(false)
    expect(win.navigator.serviceWorker.register).not.toHaveBeenCalled()
    win.navigator.onLine = true
    win.navigator.serviceWorker.register.mockRejectedValue(new Error('offline'))
    expect(await checkStartupUpdate({ win, enabled: true })).toBe(false)
  })

  it('[U04208] does not reload repeatedly after activation or in forced offline mode', async() => {
    const { win, store } = setup()
    store.set(UPDATE_RELOAD_GUARD, '1')
    expect(await checkStartupUpdate({ win, enabled: true })).toBe(false)
    expect(win.navigator.serviceWorker.register).not.toHaveBeenCalled()
    store.clear()
    win.localStorage = { getItem: () => '1' }
    expect(await checkStartupUpdate({ win, enabled: true })).toBe(false)
    expect(win.navigator.serviceWorker.register).not.toHaveBeenCalled()
  })

  it('[U04209] bounds a stalled installation and activation without leaving listeners behind', async() => {
    const { win } = setup({ activate: false })
    expect(await checkStartupUpdate({ win, enabled: true, timeoutMs: 10 })).toBe(false)
    win.navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))
    expect(win.location.reload).not.toHaveBeenCalled()
    const pending = setup({ waiting: false, installing: true })
    expect(await checkStartupUpdate({ win: pending.win, enabled: true, timeoutMs: 10 })).toBe(false)
  })

  it('[U04210] does not treat a first installation as an update requiring reload', async() => {
    const { win } = setup()
    win.navigator.serviceWorker.controller = null
    expect(await checkStartupUpdate({ win, enabled: true })).toBe(false)
    expect(win.location.reload).not.toHaveBeenCalled()
  })
})
