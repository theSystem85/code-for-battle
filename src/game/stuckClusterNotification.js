// Player-facing notice for a crowd that move-patience has already marked stuck.
// Registered through movementPatience so the simulation tick does not import UI.
import { TILE_SIZE } from '../config.js'
import { selectedUnits } from '../inputHandler.js'
import { showNotification } from '../ui/notifications.js'
import { getPlayableViewportHeight, getPlayableViewportWidth } from '../utils/layoutMetrics.js'
import {
  registerStuckClusterNotifier,
  STUCK_CLUSTER_MIN_UNITS,
  STUCK_CLUSTER_NOTIFY_COOLDOWN_MS,
  STUCK_CLUSTER_RADIUS_TILES
} from './movementPatience.js'

let lastNotice = null

export function resetStuckClusterNoticeForTests() {
  lastNotice = null
}

function shouldAnnounce(center, now) {
  if (!lastNotice) return true
  if (!Number.isFinite(now) || now - lastNotice.time >= STUCK_CLUSTER_NOTIFY_COOLDOWN_MS) return true
  const dx = (center?.x || 0) - lastNotice.x
  const dy = (center?.y || 0) - lastNotice.y
  const radius = STUCK_CLUSTER_RADIUS_TILES * TILE_SIZE
  return dx * dx + dy * dy > radius * radius
}

export function focusStuckUnits(members, gameState) {
  const living = []
  for (let i = 0; i < members.length; i++) {
    const unit = members[i]
    if (unit && unit.health > 0) living.push(unit)
  }
  if (living.length === 0) return

  const allUnits = gameState?.units || []
  for (let i = 0; i < allUnits.length; i++) allUnits[i].selected = false
  const factories = gameState?.factories || []
  for (let i = 0; i < factories.length; i++) factories[i].selected = false
  for (let i = 0; i < selectedUnits.length; i++) {
    if (selectedUnits[i]) selectedUnits[i].selected = false
  }
  selectedUnits.length = 0

  let sumX = 0
  let sumY = 0
  for (let i = 0; i < living.length; i++) {
    const unit = living[i]
    unit.selected = true
    selectedUnits.push(unit)
    sumX += unit.x + TILE_SIZE / 2
    sumY += unit.y + TILE_SIZE / 2
  }

  const canvas = typeof document !== 'undefined' ? document.getElementById('gameCanvas') : null
  const mapGrid = gameState?.mapGrid
  if (!canvas || !mapGrid?.length || !gameState) return

  const viewportWidth = getPlayableViewportWidth(canvas)
  const viewportHeight = getPlayableViewportHeight(canvas)
  if (!viewportWidth || !viewportHeight) return

  const mapWidth = mapGrid[0].length * TILE_SIZE
  const mapHeight = mapGrid.length * TILE_SIZE
  const maxScrollX = Math.max(0, mapWidth - viewportWidth)
  const maxScrollY = Math.max(0, mapHeight - viewportHeight)
  const targetX = Math.max(0, Math.min(sumX / living.length - viewportWidth / 2, maxScrollX))
  const targetY = Math.max(0, Math.min(sumY / living.length - viewportHeight / 2, maxScrollY))

  if (gameState.dragVelocity) {
    gameState.dragVelocity.x = 0
    gameState.dragVelocity.y = 0
  }
  if (gameState.smoothScroll) {
    gameState.smoothScroll.targetX = targetX
    gameState.smoothScroll.targetY = targetY
    gameState.smoothScroll.active = true
  } else if (gameState.scrollOffset) {
    gameState.scrollOffset.x = targetX
    gameState.scrollOffset.y = targetY
  }
}

export function showStuckClusterNotification(cluster, gameState, now) {
  const members = Array.isArray(cluster?.members) ? cluster.members : []
  if (members.length <= STUCK_CLUSTER_MIN_UNITS) return false
  const center = cluster.center || { x: members[0].x + TILE_SIZE / 2, y: members[0].y + TILE_SIZE / 2 }
  if (!shouldAnnounce(center, now)) return false

  lastNotice = {
    time: Number.isFinite(now) ? now : performance.now(),
    x: center.x,
    y: center.y
  }

  const message = `${members.length} of your units are stuck`
  const onActivate = () => focusStuckUnits(members, gameState)
  showNotification(message, 6000, {
    historyMessage: message,
    onActivate,
    renderContent: (notification) => {
      notification.style.display = 'flex'
      notification.style.alignItems = 'center'
      notification.style.gap = '6px'
      notification.append(message)
      notification.append(' ')

      const link = document.createElement('button')
      link.type = 'button'
      link.textContent = 'Go to units'
      link.className = 'notification__inline-link'
      link.style.background = 'none'
      link.style.border = '0'
      link.style.padding = '0'
      link.style.margin = '0'
      link.style.color = '#ffd54f'
      link.style.font = 'inherit'
      link.style.textDecoration = 'underline'
      link.style.cursor = 'pointer'
      link.addEventListener('click', (event) => {
        event.preventDefault()
        onActivate()
      })
      notification.appendChild(link)
    }
  })
  return true
}

registerStuckClusterNotifier((cluster, gameState, now) => {
  showStuckClusterNotification(cluster, gameState, now)
})
