import { TILE_SIZE, MAP_ACTION_LONG_PRESS_MS, setMapActionLongPressMs } from '../../config.js'
import { gameState } from '../../gameState.js'
import { createRadialMenu } from '../radialMenu/radialMenu.js'
import { createMapLongPressController } from './longPressController.js'
import { commandableSelection, applicableAutomations, mapActionOptions, applyMapAction } from './mapActionCommands.js'
import { broadcastGameCommand } from '../../network/commandBroadcast.js'
import { COMMAND_TYPES } from '../../network/commandTypes.js'
import { isLocalPartyAutomationLocked } from '../../network/multiplayerStore.js'
import './mapActionMenu.css'

const installedMenus = new WeakMap()

const labels = {
  forceAttackAt: 'Force attack here', defendHoldAt: 'Defend and hold here',
  applyAutomationOnArrival: 'Automation on arrival', holdFire: 'Hold fire', clearTarget: 'Clear target'
}

export function installMapActionMenu(canvas, { selection, units, commands, handler }) {
  if (installedMenus.has(canvas)) return installedMenus.get(canvas)
  const menu = createRadialMenu()
  menu.element.dataset.mapActionMenu = 'true'
  const ring = document.createElement('div')
  ring.className = 'map-action-progress'
  ring.hidden = true
  document.body.appendChild(ring)
  let origin = null
  let pressCamera = null
  let cameraTimer = 0
  let swallowUntil = 0
  const pointers = new Set()
  const owner = () => gameState.humanPlayer || 'player1'
  const locked = () => Boolean(gameState.mapEditMode || gameState.isSpectator || gameState.localPlayerDefeated ||
    gameState.hostPausedByRemote || gameState.replayMode || gameState.paused || gameState.buildingPlacementMode ||
    gameState.mobileBuildPaintMode || gameState.repairMode || gameState.sellMode || isLocalPartyAutomationLocked())
  const world = point => {
    const rect = canvas.getBoundingClientRect()
    return { x: point.x - rect.left + gameState.scrollOffset.x, y: point.y - rect.top + gameState.scrollOffset.y }
  }
  function resetInput() {
    handler.isSelecting = false
    handler.wasDragging = false
    handler.forceAttackClick = false
    handler.guardClick = false
    handler.utilityQueueCandidate = false
    if (handler.attackGroupHandler) handler.attackGroupHandler.isAttackGroupSelecting = false
    gameState.selectionActive = false
    gameState.isRightDragging = false
    for (const pointer of handler.activeTouchPointers.values()) clearTimeout(pointer.longPressTimer)
    handler.activeTouchPointers.clear()
    handler.twoFingerPan = null
  }
  function dispatch(action, point = origin) {
    if (locked() || !point) return false
    const payload = { action, ...point, entityIds: commandableSelection(selection, owner()).map(entity => entity.id) }
    if (!payload.entityIds.length || !mapActionOptions(selection, owner()).includes(action) ||
      !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 ||
      point.x >= (gameState.mapGrid?.[0]?.length || 0) * TILE_SIZE || point.y >= (gameState.mapGrid?.length || 0) * TILE_SIZE) return false
    if (action === 'applyAutomationOnArrival' && !applicableAutomations(selection, owner()).some(entry => entry.policy.id === point.policyId)) return false
    const remote = gameState.multiplayerSession?.isRemote && gameState.multiplayerSession.localRole !== 'host'
    if (!remote && !applyMapAction(payload, owner(), { units, buildings: gameState.buildings, commands, mapGrid: gameState.mapGrid })) return false
    broadcastGameCommand(COMMAND_TYPES.MAP_ACTION, payload)
    return true
  }
  function close() { menu.close() }
  function open(point) {
    if (locked() || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false
    const options = mapActionOptions(selection, owner())
    if (!options.length) return false
    origin = { x: point.x, y: point.y }
    const rect = canvas.getBoundingClientRect()
    const anchor = { x: rect.left + point.x - gameState.scrollOffset.x, y: rect.top + point.y - gameState.scrollOffset.y }
    const items = options.map(id => ({
      id, label: labels[id], text: labels[id], customTooltip: true,
      onSelect() {
        if (id === 'applyAutomationOnArrival') {
          menu.open(anchor, applicableAutomations(selection, owner()).map(entry => ({
            id: entry.policy.id, label: entry.policy.name, text: entry.policy.name, customTooltip: true,
            onSelect: () => { dispatch(id, { ...origin, policyId: entry.policy.id }); close() }
          })))
        } else { dispatch(id); close() }
      }
    }))
    menu.open(anchor, items)
    resetInput()
    return true
  }
  const controller = createMapLongPressController({
    duration: () => MAP_ACTION_LONG_PRESS_MS,
    open: point => !locked() && !handler.wasDragging && pressCamera &&
      pressCamera.x === gameState.scrollOffset.x && pressCamera.y === gameState.scrollOffset.y && open(world(point)),
    progress(point, remaining) {
      ring.hidden = !point
      if (!point) return
      ring.style.left = `${point.x}px`
      ring.style.top = `${point.y}px`
      ring.style.setProperty('--hold-time', `${remaining}ms`)
    }
  })
  function cancel() {
    controller.cancel()
    canvas.dataset.mapActionTracking = 'false'
    clearInterval(cameraTimer)
    cameraTimer = 0
  }
  function stop(event) { event.preventDefault(); event.stopImmediatePropagation() }
  window.addEventListener('pointerdown', event => {
    pointers.add(event.pointerId)
    if (pointers.size > 1) { cancel(); close(); return }
    if (menu.isOpen()) {
      stop(event)
      swallowUntil = performance.now() + 600
      const item = menu.updatePointer(event.clientX, event.clientY)
      if (item && !item.disabled) item.onSelect?.()
      else close()
      return
    }
    if (event.target !== canvas || (event.pointerType !== 'touch' && event.button !== 0) || locked() || !mapActionOptions(selection, owner()).length) return
    pressCamera = { ...gameState.scrollOffset }
    canvas.dataset.mapActionTracking = 'true'
    controller.down({ x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' })
    cameraTimer = setInterval(() => {
      if (locked() || handler.wasDragging || gameState.isRightDragging || pressCamera.x !== gameState.scrollOffset.x || pressCamera.y !== gameState.scrollOffset.y) cancel()
    }, 50)
  }, true)
  window.addEventListener('pointermove', event => {
    if (menu.isOpen()) menu.updatePointer(event.clientX, event.clientY)
    controller.move({ x: event.clientX, y: event.clientY })
    if (!controller.isTracking()) { canvas.dataset.mapActionTracking = 'false'; clearInterval(cameraTimer) }
  }, true)
  const end = event => {
    pointers.delete(event.pointerId)
    const consumed = controller.up()
    cancel()
    if (consumed || menu.isOpen()) {
      stop(event)
      swallowUntil = performance.now() + 600
      resetInput()
    }
  }
  window.addEventListener('pointerup', end, true)
  window.addEventListener('pointercancel', event => { end(event); close() }, true)
  for (const type of ['mousedown', 'mouseup', 'click', 'contextmenu']) {
    window.addEventListener(type, event => {
      if (menu.isOpen() || performance.now() < swallowUntil) stop(event)
    }, true)
  }
  window.addEventListener('wheel', () => { cancel(); close() }, true)
  window.addEventListener('blur', () => { cancel(); close(); pointers.clear() })
  window.addEventListener('keydown', event => { cancel(); if (event.key === 'Escape') close() }, true)
  const api = {
    openMapActionMenu: open,
    closeMapActionMenu: close,
    forceAttackAt: point => dispatch('forceAttackAt', point),
    defendHoldAt: point => dispatch('defendHoldAt', point),
    applyAutomationOnArrival: point => dispatch('applyAutomationOnArrival', point),
    listApplicableAutomations: () => applicableAutomations(selection, owner()).map(entry => ({ policyId: entry.policy.id, name: entry.policy.name })),
    setLongPressDuration: setMapActionLongPressMs,
    holdFire: () => dispatch('holdFire'), clearTarget: () => dispatch('clearTarget')
  }
  window.remoteControlApi = Object.assign(window.remoteControlApi || {}, api)
  const result = { ...api, close, isOpen: menu.isOpen }
  installedMenus.set(canvas, result)
  return result
}
