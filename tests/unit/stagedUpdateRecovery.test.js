import { describe, expect, it, vi } from 'vitest'
import { matchStagedUpdate } from '../../src/pwa/stagedUpdateRequest.js'
import { showUpdateRecovery } from '../../src/pwa/updateRecovery.js'

const origin = 'https://game.test'
describe('staged restart navigation', () => {
  it.each(['default', 'no-cache', 'reload'])('[U07010] serves the explicit staged navigation with cache mode %s', async cacheMode => {
    const snapshot = new Response('pinned game')
    const cache = { match: vi.fn(async() => snapshot) }
    const open = vi.fn(async() => cache)
    const clients = { get: vi.fn() }
    const request = { url: `${origin}/?cfb-update=1234567`, method: 'GET', mode: 'navigate', cache: cacheMode, headers: new Headers() }
    expect(await matchStagedUpdate(request, { clients, cacheStorage: { open }, origin })).toBe(snapshot)
    expect(open).toHaveBeenCalledWith('cfb-update-1234567')
    expect(cache.match).toHaveBeenCalledWith('/index.html')
    expect(clients.get).not.toHaveBeenCalled()
  })

  it('[U07011] serves stable-name assets from the same snapshot as the restarted client', async() => {
    const snapshot = new Response('updated sprite metadata')
    const match = vi.fn(async() => snapshot)
    const clients = { get: vi.fn(async() => ({ url: `${origin}/?cfb-update=1234567` })) }
    const request = new Request(`${origin}/images/map/sprite_sheets/index.json?cache=1`)
    expect(await matchStagedUpdate(request, { clientId: 'restarted', clients, cacheStorage: { open: async() => ({ match }) }, origin })).toBe(snapshot)
    expect(match).toHaveBeenCalledWith('/images/map/sprite_sheets/index.json')
  })

  it('[U07012] leaves ordinary navigation on the regular loading route', async() => {
    const open = vi.fn()
    const request = { url: origin, method: 'GET', mode: 'navigate', headers: new Headers() }
    expect(await matchStagedUpdate(request, { clients: {}, cacheStorage: { open }, origin })).toBeNull()
    expect(open).not.toHaveBeenCalled()
  })

  it('[U07013] keeps the frozen battle on failure and provides a clean ordinary reload', () => {
    document.body.innerHTML = '<div id="gameUpdateFrame"><img alt="paused battle"><progress id="liveUpdateProgress"></progress></div>'
    const removeItem = vi.fn()
    const assign = vi.fn()
    const win = { location: { href: `${origin}/?seed=41&cfb-update=1234567`, assign }, sessionStorage: { removeItem } }
    expect(showUpdateRecovery(new Error('boot failed'), { win, doc: document })).toBe(true)
    expect(document.querySelector('#gameUpdateFrame img')).not.toBeNull()
    expect(document.getElementById('liveUpdateProgress')).toBeNull()
    expect(document.querySelector('[role="alert"]').textContent).toContain('saved battle is preserved')
    document.querySelector('#gameUpdateRecovery button').click()
    expect(assign).toHaveBeenCalledWith(`${origin}/?seed=41`)
    expect(removeItem).toHaveBeenCalledWith('cfb-live-update-attempt')
  })
})
