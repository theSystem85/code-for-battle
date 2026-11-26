import { TILE_SIZE } from '../../config.js'
import { gameState } from '../../gameState.js'

// Event-driven draft UI; no work in the simulation or rendering loops.
export function createMapOrderDraft({ canvas, locked, commit, resetInput }) {
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
    draft = null
    gesture = null
    pointers.clear()
    overlay.hidden = true
    overlay.querySelectorAll('.map-order-draft__point').forEach(point => point.remove())
    delete canvas.dataset.mapOrderDraft
  }
  function paint() {
    overlay.querySelectorAll('.map-order-draft__point').forEach(point => point.remove())
    if (!draft) return
    const rect = canvas.getBoundingClientRect()
    for (const [index, point] of draft.points.entries()) {
      const marker = document.createElement('span')
      marker.className = 'map-order-draft__point'
      marker.textContent = String(index + 1)
      marker.style.left = `${rect.left + point.x - gameState.scrollOffset.x}px`
      marker.style.top = `${rect.top + point.y - gameState.scrollOffset.y}px`
      overlay.appendChild(marker)
    }
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
    canvas.dataset.mapOrderDraft = action
    overlay.hidden = false
    hint.textContent = action === 'patrol' ? 'Tap patrol points · Two-finger tap or Enter to loop · One point returns to your starting position' : action === 'retreatTo' ? 'Tap a retreat destination · Esc to cancel' : 'Tap to add route points · Two-finger tap or Enter to start · Esc to cancel'
  }
  function stop(event) { event.preventDefault(); event.stopImmediatePropagation() }
  function handle(event) {
    if (!draft) return false
    if (locked()) { clear(); return false }
    const tracked = pointers.get(event.pointerId)
    if (event.type === 'pointerdown') {
      if (event.target !== canvas) { clear(); return false }
      if (event.button !== 0) { clear(); stop(event); return true }
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
        paint()
      }
      tracked.lastX = event.clientX
      tracked.lastY = event.clientY
    } else if (event.type === 'pointerup' && tracked) {
      pointers.delete(event.pointerId)
      if (gesture) {
        if (!pointers.size) {
          const shouldFinish = !gesture.moved && performance.now() - gesture.time < 350
          gesture = null
          if (shouldFinish && (draft.action === 'planPath' || draft.action === 'patrol')) finish()
        }
      } else if (!tracked.moved) {
        const rect = canvas.getBoundingClientRect()
        const point = { x: event.clientX - rect.left + gameState.scrollOffset.x, y: event.clientY - rect.top + gameState.scrollOffset.y }
        const tile = gameState.mapGrid?.[Math.floor(point.y / TILE_SIZE)]?.[Math.floor(point.x / TILE_SIZE)]
        if (tile && (draft.action === 'patrol' || !['water', 'rock'].includes(tile.type) && !tile.building && !tile.seedCrystal) && draft.points.length < 256) {
          draft.points.push(point)
          if (draft.action === 'retreatTo') finish()
          else paint()
        }
      }
    } else if (event.type === 'pointercancel') clear()
    stop(event)
    return true
  }
  return { start, clear, finish, handle, paint, active: () => Boolean(draft) }
}
