import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { installMapActionMenu } from '../../src/ui/mapActions/mapActionMenu.js'
import { setMapActionLongPressMs, loadMapActionLongPressSetting, MAP_ACTION_LONG_PRESS_MS } from '../../src/config.js'
import { getStoredItem } from '../../src/storage/indexedDbStorage.js'
import { broadcastGameCommand } from '../../src/network/commandBroadcast.js'

vi.mock('../../src/network/remoteConnection.js', async importOriginal => ({ ...await importOriginal(), getActiveRemoteConnection: vi.fn() }))
vi.mock('../../src/replaySystem.js', () => ({
  createReplayEntityReference: vi.fn(unit => ({ id: unit.id })), createReplayUnitReferences: vi.fn(() => []), recordReplayCommand: vi.fn(),
  isReplayInteractionLocked: vi.fn(() => false)
}))

vi.mock('../../src/network/commandBroadcast.js', () => ({ broadcastGameCommand: vi.fn() }))
vi.mock('../../src/network/multiplayerStore.js', () => ({ isLocalPartyAutomationLocked: () => false }))

// One installed controller: listeners are intentionally owned by the game's input lifetime.
describe('map action DOM integration', () => {
  const unit = { id: 'u', owner: 'player1', health: 100, type: 'tank', x: 32, y: 32, tileX: 1, tileY: 1 }
  const selected = [unit]
  const allUnits = [unit]
  const commands = { handleAttackCommand: vi.fn(), handleMovementCommand: vi.fn() }
  const handler = { activeTouchPointers: new Map(), attackGroupHandler: {} }
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 })
  document.body.appendChild(canvas)
  const api = installMapActionMenu(canvas, { selection: selected, units: allUnits, commands, handler })
  function pointer(type, x = 100, id = 1, touch = false, y = 100) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: touch ? 'touch' : 'mouse' } })
    canvas.dispatchEvent(event)
    return event
  }
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    Object.assign(gameState, { humanPlayer: 'player1', paused: false, replayMode: false, mapEditMode: false, buildingPlacementMode: false, isSpectator: false, multiplayerSession: null, scrollOffset: { x: 0, y: 0 }, buildings: [], mapGrid: Array.from({ length: 30 }, () => Array.from({ length: 30 }, () => ({ type: 'grass' }))) })
    allUnits.splice(1)
    handler.wasDragging = false
    selected.splice(0, selected.length, unit)
    setMapActionLongPressMs(300)
  })
  afterEach(() => {
    pointer('pointercancel')
    window.dispatchEvent(new Event('blur'))
    vi.useRealTimers()
  })
  it('[U02551] consumes pointer and mouse release after a menu opens', () => {
    pointer('pointerdown')
    vi.advanceTimersByTime(300)
    expect(api.isOpen()).toBe(true)
    expect(pointer('pointerup').defaultPrevented).toBe(true)
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    const normalClick = vi.fn()
    canvas.addEventListener('click', normalClick, { once: true })
    canvas.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect(normalClick).not.toHaveBeenCalled()
    expect(commands.handleMovementCommand).not.toHaveBeenCalled()
  })
  it('[U02552] leaves a short press available to normal input', () => {
    pointer('pointerdown')
    vi.advanceTimersByTime(150)
    expect(pointer('pointerup').defaultPrevented).toBe(false)
    vi.advanceTimersByTime(500)
    expect(api.isOpen()).toBe(false)
  })
  it.each(['pan', 'drag', 'multitouch', 'placement'])('[U02553] cancels a pending hold on %s', reason => {
    pointer('pointerdown', 100, 1, true)
    if (reason === 'pan') gameState.scrollOffset.x = 32
    if (reason === 'drag') handler.wasDragging = true
    if (reason === 'multitouch') pointer('pointerdown', 140, 2, true)
    if (reason === 'placement') gameState.buildingPlacementMode = true
    vi.advanceTimersByTime(500)
    expect(api.isOpen()).toBe(false)
    pointer('pointerup', 140, 2, true)
    gameState.buildingPlacementMode = false
  })
  it('[U02554] exposes agent calls through the same dispatch path and sends remote orders without mutating local units', () => {
    expect(window.remoteControlApi.openMapActionMenu({ x: 100, y: 100 })).toBe(true)
    gameState.multiplayerSession = { isRemote: true, localRole: 'client' }
    expect(window.remoteControlApi.forceAttackAt({ x: 100, y: 100 })).toBe(true)
    expect(broadcastGameCommand).toHaveBeenCalledWith('map-action', expect.objectContaining({ action: 'forceAttackAt', entityIds: ['u'] }))
    expect(commands.handleAttackCommand).not.toHaveBeenCalled()
    gameState.multiplayerSession = null
  })
  it('[U07028] executes a hovered unit command on the original mouse or touch release', () => {
    for (const touch of [false, true]) {
      const target = { id: 'enemy', owner: 'player2', type: 'tank_v1', health: 100, x: 84, y: 84 }
      allUnits.push(target)
      pointer('pointerdown', 100, 1, touch)
      vi.advanceTimersByTime(300)
      expect(api.isOpen()).toBe(true)
      const follow = document.querySelector('[data-map-action-menu] [data-id="followUnit"]')
      expect(follow).not.toBeNull()
      const x = parseFloat(follow.style.getPropertyValue('--tx'))
      const y = parseFloat(follow.style.getPropertyValue('--ty'))
      pointer('pointermove', x, 1, touch, y)
      pointer('pointerup', x, 1, touch, y)
      expect(unit.guardTarget).toBe(target)
      expect(unit.guardOrderMode).toBe('follow')
      expect(api.isOpen()).toBe(false)
      expect(broadcastGameCommand).toHaveBeenCalledWith('map-action', expect.objectContaining({ action: 'followUnit', targetId: 'enemy' }))
      vi.advanceTimersByTime(700)
      allUnits.splice(1)
    }
  })
  it('[U07029] cancels the gesture without running a command on pointer cancellation', () => {
    pointer('pointerdown')
    vi.advanceTimersByTime(300)
    pointer('pointercancel')
    expect(api.isOpen()).toBe(false)
    expect(broadcastGameCommand).not.toHaveBeenCalled()
  })
  it('[U02555] persists duration using the game storage and reloads it', () => {
    api.setLongPressDuration(850)
    expect(getStoredItem('rts_map_action_long_press_ms')).toBe('850')
    loadMapActionLongPressSetting()
    expect(MAP_ACTION_LONG_PRESS_MS).toBe(850)
  })
})

// Re-evaluate the real remote-control initializer on either side of menu installation.
describe('map action API initialization order', () => {
  it.each(['menu-first', 'remote-first'])('[U02556] preserves every action with %s', async order => {
    vi.resetModules()
    const previousApi = window.remoteControlApi
    window.remoteControlApi = undefined
    try {
      if (order === 'remote-first') await import('../../src/input/remoteControlState.js')
      const canvas = document.createElement('canvas')
      const api = installMapActionMenu(canvas, {
        selection: [], units: [], commands: {},
        handler: { activeTouchPointers: new Map(), attackGroupHandler: {} }
      })
      if (order === 'menu-first') await import('../../src/input/remoteControlState.js')
      for (const name of ['openMapActionMenu', 'closeMapActionMenu', 'forceAttackAt', 'defendHoldAt',
        'applyAutomationOnArrival', 'listApplicableAutomations', 'setLongPressDuration', 'holdFire', 'clearTarget']) {
        expect(window.remoteControlApi[name]).toBe(api[name])
        expect(typeof window.remoteControlApi[name]).toBe('function')
      }
      expect(typeof window.remoteControlApi.setRemoteControlAction).toBe('function')
    } finally {
      window.remoteControlApi = previousApi
    }
  })
})
