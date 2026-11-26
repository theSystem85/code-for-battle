import { patrolUnitAvailable, PATROL_PERK_ID } from '../../game/patrolRoutes.js'
import { GROUND_ACTIONS, SUPPLY_TYPES, GROUND_COMMANDS, groundSelection, buildingActionOptions, availableSupply } from './groundActions.js'
import { createMapOrderDraft } from './mapOrderDraft.js'
import { unitContainsPoint } from '../../input/unitHitTest.js'
import { unitActionOptions, canServeUnit } from './unitActions.js'
import { TILE_SIZE, MAP_ACTION_LONG_PRESS_MS, setMapActionLongPressMs } from '../../config.js'
import { gameState } from '../../gameState.js'
import { createRadialMenu } from '../radialMenu/radialMenu.js'
import { createMapLongPressController } from './longPressController.js'
import { commandableSelection, applicableAutomations, mapActionOptions, applyMapAction } from './mapActionCommands.js'
import { broadcastGameCommand } from '../../network/commandBroadcast.js'
import { COMMAND_TYPES } from '../../network/commandTypes.js'
import { isLocalPartyAutomationLocked } from '../../network/multiplayerStore.js'
import { fitMapActionLabels } from './mapActionLabels.js'
import { ownsPerk, hasLivingCommandCenter, getPolicyLock } from '../../perks/perkState.js'
import { showNotification } from '../notifications.js'
import './mapActionMenu.css'

function showOrderFailure() { showNotification('No available service or reachable destination for this order', 2000) }

const installedMenus = new WeakMap()
const perkMenus = {
  commandCenter: { tree: 'command', label: 'Automation Perks' },
  technologyResearchCenter: { tree: 'research', label: 'Research Perks' }
}

function perkBuildingAt(point, owner) {
  const x = Math.floor(point.x / TILE_SIZE)
  const y = Math.floor(point.y / TILE_SIZE)
  return gameState.buildings?.find(building => Object.hasOwn(perkMenus, building.type) &&
    (building.owner === owner || (building.owner === 'player' && owner === 'player1')) &&
    building.health > 0 && !building.isBeingSold &&
    x >= building.x && x < building.x + building.width && y >= building.y && y < building.y + building.height)
}

const labels = {
  attackUnit: 'Attack', forceAttackUnit: 'Force attack', guardUnit: 'Guard', serveUnit: 'Serve', followUnit: 'Follow', landOnUnit: 'Land on', embarkUnit: 'Embark',
  patrol: 'Patrol', retreatTo: 'Retreat to…', retreatToBase: 'Retreat to base', planPath: 'Plan path', callSupply: 'Call supply',
  supplyAmmo: 'Ammo', supplyRepair: 'Repair', supplyGas: 'Gas', supplyCrew: 'Crew',
  defendBuilding: 'Defend building', repairAtBuilding: 'Get repair', fuelAtBuilding: 'Get fuel', crewAtBuilding: 'Get crew', ammoAtBuilding: 'Get ammo', unloadAtBuilding: 'Unload ore',
  c5Airdrop: 'Airdrop here', c5Unload: 'Unload / cancel',
  forceAttackAt: 'Force attack here', defendHoldAt: 'Defend and hold here',
  applyAutomationOnArrival: 'Automation on arrival', holdFire: 'Hold fire', clearTarget: 'Clear target'
}

export function installMapActionMenu(canvas, { selection, units, commands, handler }) {
  if (installedMenus.has(canvas)) return installedMenus.get(canvas)
  const menu = createRadialMenu({ onSubmenuOpen: fitMapActionLabels })
  menu.element.dataset.mapActionMenu = 'true'
  const ring = document.createElement('div')
  ring.className = 'map-action-progress'
  ring.hidden = true
  document.body.appendChild(ring)
  let origin = null
  let targetUnit = null
  let targetBuilding = null
  let rightDown = null
  let heldPointer = null
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
  const draft = createMapOrderDraft({ canvas, locked, resetInput,
    commit: (action, point, entityIds) => dispatch(action, point, entityIds) })
  function dispatch(action, point = origin, entityIds = null) {
    if (locked() || !point) return false
    const payload = { action, ...point, ...((targetUnit || targetBuilding) ? { targetId: (targetUnit || targetBuilding).id } : {}), entityIds: entityIds || commandableSelection(selection, owner()).map(entity => entity.id) }
    if (!payload.entityIds.length || !(entityIds ? [...GROUND_COMMANDS, 'patrol'] : [...optionsForTarget(), ...Object.keys(SUPPLY_TYPES)]).includes(action) ||
      !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 ||
      point.x >= (gameState.mapGrid?.[0]?.length || 0) * TILE_SIZE || point.y >= (gameState.mapGrid?.length || 0) * TILE_SIZE) return false
    if (action === 'applyAutomationOnArrival' && !applicableAutomations(selection, owner()).some(entry => entry.policy.id === point.policyId)) return false
    const remote = gameState.multiplayerSession?.isRemote && gameState.multiplayerSession.localRole !== 'host'
    if (!remote && !applyMapAction(payload, owner(), { units, buildings: gameState.buildings, commands, mapGrid: gameState.mapGrid, occupancyMap: gameState.occupancyMap })) return false
    broadcastGameCommand(COMMAND_TYPES.MAP_ACTION, payload)
    return true
  }
  function close() { menu.close(); targetUnit = null; targetBuilding = null }
  function optionsForTarget() {
    const tileOptions = mapActionOptions(selection, owner())
    const groundOptions = groundSelection(selection, owner()).length ? GROUND_ACTIONS : []
    if (targetBuilding) return [...buildingActionOptions(selection, targetBuilding, owner()), ...groundOptions, ...tileOptions.filter(action => action === 'patrol')]
    if (!targetUnit) return tileOptions
    return [...unitActionOptions(selection, targetUnit, owner(), gameState.buildings), ...tileOptions.filter(action => action === 'c5Airdrop' || action === 'patrol' || groundOptions.includes(action))]
  }
  function openPerkBuilding(building, anchor) {
    if (locked() || !building) return false
    const { tree, label } = perkMenus[building.type]
    targetUnit = null
    origin = null
    menu.open(anchor, [{
      id: 'open-building-perks', label, text: 'Perks',
      onSelect() {
        close()
        const current = gameState.buildings?.includes(building) && building.health > 0 && !building.isBeingSold
        if (current && !locked()) import('../perks/perkTree.js').then(({ openPerkTree }) => openPerkTree(tree))
      }
    }])
    return true
  }
  function open(point) {
    if (locked() || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false
    const rect = canvas.getBoundingClientRect()
    const anchor = { x: rect.left + point.x - gameState.scrollOffset.x, y: rect.top + point.y - gameState.scrollOffset.y }
    if (!groundSelection(selection, owner()).length && openPerkBuilding(perkBuildingAt(point, owner()), anchor)) {
      resetInput()
      return true
    }
    targetBuilding = gameState.buildings?.find(building => building.health > 0 &&
      point.x >= building.x * TILE_SIZE && point.x < (building.x + building.width) * TILE_SIZE &&
      point.y >= building.y * TILE_SIZE && point.y < (building.y + building.height) * TILE_SIZE) || null
    targetUnit = units.find(unit => !selection.includes(unit) && unitContainsPoint(unit, point.x, point.y)) || null
    const options = optionsForTarget()
    if (!options.length) return false
    origin = { x: point.x, y: point.y }
    const items = options.map(id => ({
      id, label: labels[id], text: labels[id], customTooltip: true,
      disabled: id === 'patrol' && !ownsPerk(owner(), PATROL_PERK_ID) || id === 'serveUnit' && !selection.some(unit => canServeUnit(unit, targetUnit, gameState.buildings, commands)),
      onDisabledSelect: id === 'patrol' ? () => {
        close()
        if (hasLivingCommandCenter(owner())) import('../perks/perkTree.js').then(({ openPerkTree }) => openPerkTree('command', PATROL_PERK_ID))
        else showNotification('Build a Command Center to unlock Patrol Routes (2 stars)', 2500)
      } : undefined,
      children: id === 'callSupply' ? Object.keys(SUPPLY_TYPES).map(action => ({
        id: action, label: labels[action], text: labels[action], customTooltip: true,
        disabled: !availableSupply(selection, owner(), { units, buildings: gameState.buildings, commands }, action).length,
        onSelect() { if (!dispatch(action)) showOrderFailure(); close() }
      })) : undefined,
      onSelect() {
        if (id === 'retreatTo' || id === 'planPath' || id === 'patrol') {
          const ids = (id === 'patrol' ? commandableSelection(selection, owner()).filter(patrolUnitAvailable) : groundSelection(selection, owner())).map(unit => unit.id)
          close()
          draft.start(id, ids)
        } else if (id === 'applyAutomationOnArrival') {
          menu.open(anchor, applicableAutomations(selection, owner()).map(entry => ({
            id: entry.policy.id, label: entry.policy.name, text: entry.policy.name, customTooltip: true,
            disabled: Boolean(getPolicyLock(owner(), entry.policy)),
            tooltipLines: getPolicyLock(owner(), entry.policy) ? [`🔒 ${getPolicyLock(owner(), entry.policy)}`] : [],
            onSelect: () => { dispatch(id, { ...origin, policyId: entry.policy.id }); close() }
          })))
          fitMapActionLabels(menu.element)
        } else { if (!dispatch(id)) showOrderFailure(); close() }
      }
    }))
    menu.open(anchor, items)
    fitMapActionLabels(menu.element)
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
    delete canvas.dataset.mapActionGroundContext
    clearInterval(cameraTimer)
    cameraTimer = 0
  }
  function stop(event) { event.preventDefault(); event.stopImmediatePropagation() }
  window.addEventListener('mousedown', event => {
    rightDown = null
    if (event.target !== canvas || event.button !== 2 || locked() || menu.isOpen()) return
    const anchor = { x: event.clientX, y: event.clientY }
    const building = perkBuildingAt(world(anchor), owner())
    if (building) rightDown = { ...anchor, building }
  }, true)
  window.addEventListener('mouseup', event => {
    if (event.button !== 2 || !rightDown) return
    const down = rightDown
    rightDown = null
    if (event.target !== canvas || handler.rightWasDragging || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 3) return
    const anchor = { x: event.clientX, y: event.clientY }
    if (perkBuildingAt(world(anchor), owner()) === down.building && openPerkBuilding(down.building, anchor)) {
      gameState.suppressRightClickDeselect = true
    }
  }, true)
  window.addEventListener('pointerdown', event => {
    if (draft.handle(event)) return
    pointers.add(event.pointerId)
    if (pointers.size > 1) { cancel(); close(); return }
    if (menu.isOpen()) {
      stop(event)
      swallowUntil = performance.now() + 600
      heldPointer = event.pointerId
      if (!menu.updatePointer(event.clientX, event.clientY)) close()
      return
    }
    if (event.target !== canvas || (event.pointerType !== 'touch' && event.button !== 0) || locked()) return
    if (!mapActionOptions(selection, owner()).length && !perkBuildingAt(world({ x: event.clientX, y: event.clientY }), owner())) return
    heldPointer = event.pointerId
    pressCamera = { ...gameState.scrollOffset }
    canvas.dataset.mapActionTracking = 'true'
    canvas.dataset.mapActionGroundContext = String(groundSelection(selection, owner()).length > 0)
    controller.down({ x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' })
    cameraTimer = setInterval(() => {
      if (locked() || handler.wasDragging || gameState.isRightDragging || pressCamera.x !== gameState.scrollOffset.x || pressCamera.y !== gameState.scrollOffset.y) cancel()
    }, 50)
  }, true)
  window.addEventListener('pointermove', event => {
    if (draft.handle(event)) return
    if (menu.isOpen()) menu.updatePointer(event.clientX, event.clientY)
    controller.move({ x: event.clientX, y: event.clientY })
    if (!controller.isTracking()) { canvas.dataset.mapActionTracking = 'false'; clearInterval(cameraTimer) }
  }, true)
  const end = event => {
    if (draft.handle(event)) { swallowUntil = performance.now() + 600; return }
    pointers.delete(event.pointerId)
    const consumed = controller.up()
    if (event.type !== 'pointercancel' && heldPointer === event.pointerId && menu.isOpen()) {
      menu.activate(event.clientX, event.clientY)
    }
    heldPointer = null
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
      if (type === 'mouseup' && event.button === 2) return
      if (draft.active() || menu.isOpen() || (event.target === canvas && performance.now() < swallowUntil)) stop(event)
    }, true)
  }
  window.addEventListener('wheel', () => {
    cancel(); close()
    if (draft.active()) requestAnimationFrame(draft.paint)
  }, true)
  window.addEventListener('blur', () => { draft.clear(); cancel(); close(); pointers.clear(); rightDown = null })
  window.addEventListener('keydown', event => {
    cancel()
    if (event.key === 'Escape') { draft.clear(); close() }
    if (event.key === 'Enter' && draft.active()) { event.preventDefault(); draft.finish() }
  }, true)
  const api = {
    openMapActionMenu: open,
    closeMapActionMenu: () => { draft.clear(); close() },
    finishMapPath: draft.finish,
    patrol: point => dispatch('patrol', point),
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
