import { gameState } from '../../gameState.js'
import { isLocalPartyAutomationLocked } from '../../network/multiplayerStore.js'
import { createLongPressTracker, LONG_PRESS_MS } from '../radialMenu/longPressTracker.js'
import { createRadialMenu } from '../radialMenu/radialMenu.js'
import { buildProductionRadialItems, radialProductionButtonSize } from './productionCatalog.js'
import {
  findOwnedProductionBuildingFromClient,
  productionBuildingAnchor,
  productionMenuRadius
} from './productionBuildingTarget.js'

function replayInteractionLocked() {
  return Boolean(gameState.replayMode && !gameState.replay?.isApplyingReplayCommand)
}

let selectItemPromise = null
function loadSelectItem() {
  if (!selectItemPromise) {
    selectItemPromise = import('./productionRadialSelect.js')
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
    if (session.opened && menu) {
      menu.updatePointer(event.clientX, event.clientY)
    }
    event.preventDefault()
    event.stopPropagation()
  }

  const onUp = (event) => {
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
    if (!session || !session.opened) return
    if (event.key !== 'Escape') return
    clearTimer()
    setMenuFlag(false)
    session = null
    if (menu) menu.close()
  })

  return {
    isOpen: () => Boolean(menu && menu.isOpen()),
    close: () => {
      if (menu) menu.close()
    }
  }
}
