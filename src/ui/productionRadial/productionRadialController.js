import { TILE_SIZE } from '../../config.js'
import { gameState } from '../../gameState.js'
import { isLocalPartyAutomationLocked } from '../../network/multiplayerStore.js'
import { createLongPressTracker, LONG_PRESS_MS } from '../radialMenu/longPressTracker.js'
import { createRadialMenu } from '../radialMenu/radialMenu.js'
import { buildProductionRadialItems, radialProductionButtonSize } from './productionCatalog.js'
import { createBuildingButtonHold, tileFromClient } from './radialBlueprintGesture.js'
import {
  findOwnedProductionBuildingFromClient,
  productionBuildingAnchor,
  productionMenuRadius
} from './productionBuildingTarget.js'

function replayInteractionLocked() {
  return Boolean(gameState.replayMode && !gameState.replay?.isApplyingReplayCommand)
}

let selectItemPromise = null
let radialCommands = null
function loadSelectItem() {
  if (!selectItemPromise) {
    selectItemPromise = import('./productionRadialSelect.js').then(mod => {
      radialCommands = mod
      return mod
    })
  }
  return selectItemPromise
}

function gestureBlocked() {
  if (gameState.mapEditMode) return true
  if (gameState.buildingPlacementMode || gameState.mobileBuildPaintMode) return true
  if (gameState.repairMode || gameState.sellMode) return true
  if (gameState.isSpectator || gameState.localPlayerDefeated) return true
  if (replayInteractionLocked() || isLocalPartyAutomationLocked()) return true
  return false
}

function dispatchMouse(canvas, type, x, y) {
  canvas.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'mouseup' ? 0 : 1
  }))
}

function dispatchTouchPointer(canvas, type, source, x, y) {
  const Ctor = window.PointerEvent || MouseEvent
  canvas.dispatchEvent(new Ctor(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    pointerId: source.pointerId ?? 1,
    pointerType: 'touch',
    isPrimary: true
  }))
}

const installedCanvases = new WeakSet()

export function installProductionRadialMenu(canvas) {
  if (!canvas || installedCanvases.has(canvas)) return null
  if (canvas.dataset && canvas.dataset.productionRadialMenu === 'true') return null
  installedCanvases.add(canvas)
  if (canvas.dataset) canvas.dataset.productionRadialMenu = 'true'

  let menu = null
  const ensureMenu = () => {
    if (!menu) menu = createRadialMenu()
    return menu
  }
  let session = null
  let bypass = false
  const buttonHold = createBuildingButtonHold()
  let planDrag = null
  let enterPromise = null
  let armFrame = 0
  let ghostFrame = 0
  let swallowClick = false
  let allowPlanClick = false

  const withBypass = (fn) => {
    bypass = true
    try {
      fn()
    } finally {
      bypass = false
    }
  }

  const clearTimer = () => {
    if (session && session.timer) {
      clearTimeout(session.timer)
      session.timer = null
    }
  }

  const setMenuFlag = (open) => {
    gameState.productionRadialMenuOpen = open
  }

  const stopArm = () => {
    if (armFrame) cancelAnimationFrame(armFrame)
    armFrame = 0
  }

  const stopGhost = () => {
    if (ghostFrame) cancelAnimationFrame(ghostFrame)
    ghostFrame = 0
  }

  const setDragClass = (active) => {
    if (document.body) document.body.classList.toggle('radial-blueprint-drag', active)
  }

  const syncGhost = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect()
    const tile = tileFromClient(clientX, clientY, rect, gameState.scrollOffset, TILE_SIZE)
    gameState.cursorX = tile.worldX
    gameState.cursorY = tile.worldY
    const edge = gameState.desktopEdgeScroll
    if (edge) {
      edge.clientX = clientX
      edge.clientY = clientY
      edge.overCanvas = clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top && clientY <= rect.bottom
    }
    return tile
  }

  const releaseZone = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect()
    const inside = clientX >= rect.left && clientX <= rect.right &&
      clientY >= rect.top && clientY <= rect.bottom
    if (!inside) return 'ui'
    const el = document.elementFromPoint ? document.elementFromPoint(clientX, clientY) : canvas
    if (!el || el === canvas || (canvas.contains && canvas.contains(el))) return 'map'
    return 'ui'
  }

  const startGhost = () => {
    if (ghostFrame) return
    const tick = () => {
      if (!planDrag) {
        ghostFrame = 0
        return
      }
      syncGhost(planDrag.x, planDrag.y)
      ghostFrame = requestAnimationFrame(tick)
    }
    ghostFrame = requestAnimationFrame(tick)
  }

  const applyHoldVisual = (hold) => {
    if (!menu) return
    if (!hold || hold.phase === 'idle' || !hold.item) {
      menu.setHoldProgress(null, 0)
      return
    }
    menu.setHoldProgress(hold.item.id, hold.progress)
  }

  const cancelPlan = () => {
    planDrag = null
    setDragClass(false)
    stopGhost()
    swallowClick = true
    if (radialCommands) radialCommands.cancelRadialBuildingPlan()
    else loadSelectItem().then(mod => mod.cancelRadialBuildingPlan())
  }

  const finishPlanDrag = (event) => {
    if (!planDrag) return
    const drag = planDrag
    planDrag = null
    setDragClass(false)
    stopGhost()
    swallowClick = true
    gameState.selectionActive = false
    const clientX = event.clientX
    const clientY = event.clientY
    const run = () => {
      const plan = gameState.radialBuildingPlan
      if (!plan || !radialCommands) return
      const tile = syncGhost(clientX, clientY)
      const overUi = releaseZone(clientX, clientY) === 'ui'
      const canPlace = overUi ? false : radialCommands.canRadialPlace(plan, tile.tileX, tile.tileY)
      const decision = radialCommands.finishRadialBlueprintDrag(plan, {
        overUi,
        canPlace,
        tileX: tile.tileX,
        tileY: tile.tileY
      })
      if (decision === 'place-ready') {
        allowPlanClick = true
        canvas.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX,
          clientY,
          button: 0
        }))
        if (!gameState.buildingPlacementMode) gameState.radialBuildingPlan = null
      }
    }
    if (drag.pending && enterPromise) enterPromise.then(run)
    else run()
  }

  const beginAttachedPlan = (item, event) => {
    stopArm()
    buttonHold.reset()
    if (menu) {
      menu.setHoldProgress(null, 0)
      menu.close()
    }
    setMenuFlag(false)
    clearTimer()
    const pointerId = session ? session.pointerId : (event.pointerId ?? null)
    const source = (session && session.pointerType === 'touch') || event.pointerType === 'touch'
      ? 'pointer'
      : 'mouse'
    session = null
    planDrag = {
      pointerId,
      source,
      x: event.clientX,
      y: event.clientY,
      pending: true
    }
    setDragClass(true)
    syncGhost(event.clientX, event.clientY)
    startGhost()
    enterPromise = loadSelectItem().then(mod => {
      const started = mod.enterRadialBuildingPlan(item)
      if (planDrag) planDrag.pending = false
      if (!started) {
        planDrag = null
        setDragClass(false)
        stopGhost()
      }
      return started
    })
  }

  const scheduleArm = () => {
    if (armFrame) return
    const tick = () => {
      armFrame = 0
      if (!session || !session.opened || planDrag) return
      const hold = buttonHold.poll(performance.now())
      applyHoldVisual(hold)
      if (hold.phase === 'fire') {
        beginAttachedPlan(hold.item, {
          clientX: session ? session.lastX : 0,
          clientY: session ? session.lastY : 0,
          pointerId: session ? session.pointerId : null,
          pointerType: session ? session.pointerType : 'mouse'
        })
        return
      }
      if (hold.phase === 'arming') scheduleArm()
    }
    armFrame = requestAnimationFrame(tick)
  }

  const finishMenu = (x, y) => {
    const building = session && session.building
    const hovered = menu && menu.isOpen() ? menu.updatePointer(x, y) : null
    setMenuFlag(false)
    session = null
    if (menu) menu.close()
    if (hovered && building) {
      loadSelectItem().then(({ selectProductionRadialItem }) => {
        selectProductionRadialItem(hovered, building)
      })
    }
  }

  const replayShort = (snapshot, x, y) => {
    withBypass(() => {
      if (snapshot.pointerType === 'touch') {
        dispatchTouchPointer(canvas, 'pointerdown', snapshot, snapshot.startX, snapshot.startY)
        dispatchTouchPointer(canvas, 'pointerup', snapshot, x, y)
      } else {
        dispatchMouse(canvas, 'mousedown', snapshot.startX, snapshot.startY)
        dispatchMouse(canvas, 'mouseup', x, y)
      }
    })
  }

  const handOff = (snapshot, x, y) => {
    snapshot.handedOff = true
    clearTimer()
    withBypass(() => {
      if (snapshot.pointerType === 'touch') {
        dispatchTouchPointer(canvas, 'pointerdown', snapshot, snapshot.startX, snapshot.startY)
        dispatchTouchPointer(canvas, 'pointermove', snapshot, x, y)
      } else {
        dispatchMouse(canvas, 'mousedown', snapshot.startX, snapshot.startY)
        dispatchMouse(canvas, 'mousemove', x, y)
      }
    })
  }

  const relayHandedOff = (type, x, y, snapshot) => {
    if (snapshot.pointerType === 'touch') return
    withBypass(() => {
      dispatchMouse(canvas, type, x, y)
    })
  }

  const openFromSession = () => {
    if (!session || session.handedOff || session.opened) return
    const decision = session.tracker.poll(performance.now())
    if (decision.action !== 'fire') return
    const items = buildProductionRadialItems(session.building.type)
    if (items.length === 0) {
      session.empty = true
      return
    }
    session.items = items
    session.opened = true
    setMenuFlag(true)
    const anchor = productionBuildingAnchor(session.building, canvas)
    const buttonSize = radialProductionButtonSize()
    ensureMenu().open(anchor, items, {
      buttonSize,
      radius: productionMenuRadius(session.building, buttonSize),
      duration: 220,
      stagger: 48,
      budgetMs: 1000
    })
  }

  const begin = (event, pointerType) => {
    if (bypass || session || gestureBlocked()) return false
    loadSelectItem()
    if (pointerType !== 'touch' && event.button !== 0) return false
    const building = findOwnedProductionBuildingFromClient(event.clientX, event.clientY, canvas)
    if (!building) return false
    const tracker = createLongPressTracker({ holdMs: LONG_PRESS_MS })
    tracker.pointerDown({ x: event.clientX, y: event.clientY }, performance.now())
    session = {
      pointerId: event.pointerId ?? null,
      pointerType,
      startX: event.clientX,
      startY: event.clientY,
      building,
      tracker,
      opened: false,
      handedOff: false,
      empty: false,
      items: null,
      lastX: event.clientX,
      lastY: event.clientY,
      timer: window.setTimeout(openFromSession, LONG_PRESS_MS)
    }
    if (pointerType !== 'mouse' && canvas.setPointerCapture && event.pointerId != null) {
      try {
        canvas.setPointerCapture(event.pointerId)
      } catch {
        // Pointer capture is a delivery hint; document listeners cover the rest.
      }
    }
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  const matchesSession = (event) => {
    if (!session) return false
    if (session.pointerId == null || event.pointerId == null) return true
    return event.pointerId === session.pointerId
  }

  const onMove = (event, fromPointer) => {
    if (!session || !matchesSession(event)) return
    if (fromPointer && session.pointerType === 'mouse' && event.pointerType && event.pointerType !== 'mouse') return
    if (session.handedOff) {
      if (fromPointer) relayHandedOff('mousemove', event.clientX, event.clientY, session)
      return
    }
    const decision = session.tracker.pointerMove(
      { x: event.clientX, y: event.clientY },
      performance.now()
    )
    if (decision.action === 'cancel') {
      const snapshot = session
      handOff(snapshot, event.clientX, event.clientY)
      return
    }
    session.lastX = event.clientX
    session.lastY = event.clientY
    if (session.opened && menu && !planDrag) {
      const hovered = menu.updatePointer(event.clientX, event.clientY)
      const hold = buttonHold.track(hovered, performance.now())
      applyHoldVisual(hold)
      if (hold.phase === 'fire') {
        beginAttachedPlan(hold.item, event)
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (hold.phase === 'arming') scheduleArm()
      else stopArm()
    }
    event.preventDefault()
    event.stopPropagation()
  }

  const onUp = (event) => {
    if (planDrag && (planDrag.pointerId == null || event.pointerId == null || event.pointerId === planDrag.pointerId)) {
      finishPlanDrag(event)
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!session || !matchesSession(event)) return
    const snapshot = session
    clearTimer()
    if (snapshot.handedOff) {
      session = null
      if (snapshot.pointerType !== 'touch') {
        relayHandedOff('mouseup', event.clientX, event.clientY, snapshot)
        event.stopPropagation()
      }
      return
    }
    const decision = snapshot.tracker.pointerUp(
      { x: event.clientX, y: event.clientY },
      performance.now()
    )
    event.preventDefault()
    event.stopPropagation()
    stopArm()
    buttonHold.reset()
    if (menu) menu.setHoldProgress(null, 0)
    if (snapshot.opened) {
      finishMenu(event.clientX, event.clientY)
      return
    }
    session = null
    setMenuFlag(false)
    if (menu) menu.close()
    if (decision.action === 'short' || decision.action === 'release' || snapshot.empty) {
      replayShort(snapshot, event.clientX, event.clientY)
    }
  }

  const onPointerDown = (event) => {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'touch' && event.pointerType !== 'pen') return
    const kind = event.pointerType === 'touch' ? 'touch' : 'mouse'
    begin(event, kind)
  }

  const onMouseDown = (event) => {
    if (session) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    begin(event, 'mouse')
  }

  canvas.addEventListener('pointerdown', onPointerDown, { capture: true, passive: false })
  canvas.addEventListener('pointermove', (event) => onMove(event, true), { capture: true, passive: false })
  canvas.addEventListener('pointerup', onUp, { capture: true, passive: false })
  canvas.addEventListener('pointercancel', onUp, { capture: true, passive: false })
  canvas.addEventListener('mousedown', onMouseDown, { capture: true })
  canvas.addEventListener('mousemove', (event) => {
    if (!session || session.pointerType === 'touch') return
    if (session.pointerId != null && event.pointerId != null && event.pointerId !== session.pointerId) return
    onMove(event, false)
  }, { capture: true })
  canvas.addEventListener('mouseup', (event) => {
    if (!session || session.pointerType === 'touch') return
    onUp(event)
  }, { capture: true })

  canvas.addEventListener('touchstart', (event) => {
    if (!event.changedTouches || event.changedTouches.length !== 1) return
    const touch = event.changedTouches[0]
    if (!findOwnedProductionBuildingFromClient(touch.clientX, touch.clientY, canvas)) return
    event.preventDefault()
  }, { capture: true, passive: false })

  document.addEventListener('contextmenu', (event) => {
    if (!session) return
    event.preventDefault()
    event.stopPropagation()
  }, { capture: true })

  document.addEventListener('selectstart', (event) => {
    if (!session) return
    event.preventDefault()
  }, { capture: true })

  document.addEventListener('keydown', (event) => {
    if (session && session.opened && event.key === 'Escape' && !gameState.radialBuildingPlan) {
      clearTimer()
      stopArm()
      buttonHold.reset()
      setMenuFlag(false)
      session = null
      if (menu) menu.close()
      return
    }
    if (!gameState.radialBuildingPlan && !planDrag) return
    const key = event.key
    if (key !== 'Escape' && key !== 'b' && key !== 'B') return
    const tag = event.target && event.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    cancelPlan()
  })

  const onPlanPointerDown = (event) => {
    if (session || !gameState.radialBuildingPlan || planDrag) {
      if (gameState.radialBuildingPlan && event.button === 2) {
        event.preventDefault()
        event.stopPropagation()
        cancelPlan()
      }
      return
    }
    if (event.button === 2) {
      event.preventDefault()
      event.stopPropagation()
      cancelPlan()
      return
    }
    if (event.button !== 0 && event.pointerType !== 'touch') return
    if (releaseZone(event.clientX, event.clientY) === 'ui') return
    planDrag = {
      pointerId: event.pointerId ?? null,
      source: event.pointerType === 'touch' ? 'pointer' : 'mouse',
      x: event.clientX,
      y: event.clientY,
      pending: false
    }
    setDragClass(true)
    syncGhost(event.clientX, event.clientY)
    startGhost()
    gameState.selectionActive = false
    event.preventDefault()
    event.stopPropagation()
  }

  const onPlanMouseDown = (event) => {
    if (!gameState.radialBuildingPlan) return
    if (event.button === 2) {
      event.preventDefault()
      event.stopPropagation()
      cancelPlan()
      return
    }
    if (planDrag) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (session || event.button !== 0) return
    if (releaseZone(event.clientX, event.clientY) === 'ui') return
    planDrag = {
      pointerId: null,
      source: 'mouse',
      x: event.clientX,
      y: event.clientY,
      pending: false
    }
    setDragClass(true)
    syncGhost(event.clientX, event.clientY)
    startGhost()
    gameState.selectionActive = false
    event.preventDefault()
    event.stopPropagation()
  }

  const onPlanMove = (event) => {
    if (!planDrag) return
    if (planDrag.pointerId != null && event.pointerId != null && event.pointerId !== planDrag.pointerId) return
    planDrag.x = event.clientX
    planDrag.y = event.clientY
    syncGhost(event.clientX, event.clientY)
    gameState.selectionActive = false
    if (planDrag.source === 'pointer' || event.pointerType === 'touch') {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  document.addEventListener('pointerdown', onPlanPointerDown, { capture: true, passive: false })
  document.addEventListener('mousedown', onPlanMouseDown, { capture: true })
  document.addEventListener('pointermove', onPlanMove, { capture: true, passive: false })
  document.addEventListener('mousemove', (event) => {
    if (!planDrag || planDrag.source !== 'mouse') return
    planDrag.x = event.clientX
    planDrag.y = event.clientY
    syncGhost(event.clientX, event.clientY)
    gameState.selectionActive = false
  }, { capture: true })
  document.addEventListener('pointerup', (event) => {
    if (planDrag) {
      if (planDrag.pointerId != null && event.pointerId != null && event.pointerId !== planDrag.pointerId) return
      finishPlanDrag(event)
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!gameState.radialBuildingPlan || event.button !== 0) return
    if (releaseZone(event.clientX, event.clientY) !== 'ui') return
    cancelPlan()
    event.preventDefault()
    event.stopPropagation()
  }, { capture: true })
  document.addEventListener('mouseup', (event) => {
    if (planDrag && planDrag.source === 'mouse') {
      finishPlanDrag(event)
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!gameState.radialBuildingPlan || event.button !== 0 || planDrag) return
    if (releaseZone(event.clientX, event.clientY) !== 'ui') return
    cancelPlan()
  }, { capture: true })
  document.addEventListener('click', (event) => {
    if (allowPlanClick) {
      allowPlanClick = false
      return
    }
    if (!swallowClick) return
    swallowClick = false
    event.preventDefault()
    event.stopPropagation()
  }, { capture: true })
  document.addEventListener('contextmenu', (event) => {
    if (!gameState.radialBuildingPlan && !planDrag) return
    event.preventDefault()
    event.stopPropagation()
    cancelPlan()
  }, { capture: true })

  return {
    isOpen: () => Boolean(menu && menu.isOpen()),
    close: () => {
      if (menu) menu.close()
    }
  }
}
