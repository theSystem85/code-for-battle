import { TILE_SIZE } from '../../config.js'
import { gameState } from '../../gameState.js'

let preview = null

export function getMapOrderPreview() { return preview }

// The renderer reads the same world-space points that will be sent with the order.
export function createMapOrderDraft({ canvas, locked, commit, resetInput, requestRender }) {
  let draft = null
  const pointers = new Map()
  let gesture = null
  const overlay = document.createElement('div')
  overlay.className = 'map-order-draft'
  overlay.hidden = true
  document.body.appendChild(overlay)
  const hint = document.createElement('div')
  hint.className = 'map-order-draft__hint'
  overlay.appendChild(hint)
  function clear() {
    if (draft && preview === draft) {
      preview = null
      requestRender?.()
    }
    draft = null
    gesture = null
    pointers.clear()
    overlay.hidden = true
    delete canvas.dataset.mapOrderDraft
  }
  function finish() {
    if (!draft || locked() || !draft.points.length) return false
    const order = draft
    clear()
    return commit(order.action, { ...order.points[0], points: order.points }, order.entityIds)
  }
  function start(action, entityIds) {
    clear()
    draft = { action, entityIds: entityIds.slice(), points: [] }
    preview = draft
    canvas.dataset.mapOrderDraft = action
    overlay.hidden = false
    hint.textContent = action === 'patrol' ? 'Add patrol points · Right-click, two-finger tap or Enter to loop · One point returns to your starting position' : 'Add route points · Right-click, two-finger tap or Enter to start · Esc to cancel'
  }
  function stop(event) { event.preventDefault(); event.stopImmediatePropagation() }
  function handle(event) {
    if (!draft) return false
    if (locked()) { clear(); return false }
    const tracked = pointers.get(event.pointerId)
    if (event.type === 'pointerdown') {
      if (event.target !== canvas) { clear(); return false }
      if (event.button === 2) { finish(); stop(event); return true }
      if (event.button !== 0) { stop(event); return true }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false })
      if (pointers.size > 1) gesture = { time: performance.now(), moved: false }
      resetInput()
    } else if (event.type === 'pointermove' && tracked) {
      const dx = event.clientX - tracked.lastX
      const dy = event.clientY - tracked.lastY
      if (Math.hypot(event.clientX - tracked.x, event.clientY - tracked.y) > 12) {
        tracked.moved = true
        if (gesture) gesture.moved = true
      }
      if (gesture?.moved && pointers.size >= 2) {
        const rect = canvas.getBoundingClientRect()
        gameState.scrollOffset.x = Math.max(0, Math.min(Math.max(0, gameState.mapGrid[0].length * TILE_SIZE - rect.width), gameState.scrollOffset.x - dx / pointers.size))
        gameState.scrollOffset.y = Math.max(0, Math.min(Math.max(0, gameState.mapGrid.length * TILE_SIZE - rect.height), gameState.scrollOffset.y - dy / pointers.size))
        requestRender?.()
      }
      tracked.lastX = event.clientX
      tracked.lastY = event.clientY
    } else if (event.type === 'pointerup' && tracked) {
      pointers.delete(event.pointerId)
      if (gesture) {
        if (!pointers.size) {
          const shouldFinish = !gesture.moved && performance.now() - gesture.time < 350
          gesture = null
          if (shouldFinish) finish()
        }
      } else if (!tracked.moved) {
        const rect = canvas.getBoundingClientRect()
        const point = { x: event.clientX - rect.left + gameState.scrollOffset.x, y: event.clientY - rect.top + gameState.scrollOffset.y }
        const tile = gameState.mapGrid?.[Math.floor(point.y / TILE_SIZE)]?.[Math.floor(point.x / TILE_SIZE)]
        if (tile && (draft.action === 'patrol' || !['water', 'rock'].includes(tile.type) && !tile.building && !tile.seedCrystal) && draft.points.length < 256) {
          draft.points.push(point)
          requestRender?.()
        }
      }
    } else if (event.type === 'pointercancel') clear()
    stop(event)
    return true
  }
  return { start, clear, finish, handle, active: () => Boolean(draft) }
}
