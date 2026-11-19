import { TILE_SIZE } from '../config.js'
import { getPlayableViewportHeight, getPlayableViewportWidth } from '../utils/layoutMetrics.js'
import { showNotification } from './notifications.js'

export function notifyBuildingFire(state, grid, building) {
  if (!building?.owner || building.owner !== state.humanPlayer || state.benchmarkActive || state.heavyBattleBenchmark || state.mapGrid !== grid || !globalThis.document?.body) return

  const name = building.displayName || building.type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, letter => letter.toUpperCase())
  const message = `${name} caught fire!`
  const focus = () => {
    const canvas = document.getElementById('gameCanvas')
    if (!canvas || !state.scrollOffset || state.mapGrid !== grid) return
    const width = getPlayableViewportWidth(canvas)
    const height = getPlayableViewportHeight(canvas)
    const x = Math.max(0, Math.min((building.x + (building.width || 1) / 2) * TILE_SIZE - width / 2, grid[0].length * TILE_SIZE - width))
    const y = Math.max(0, Math.min((building.y + (building.height || 1) / 2) * TILE_SIZE - height / 2, grid.length * TILE_SIZE - height))
    if (state.dragVelocity) { state.dragVelocity.x = 0; state.dragVelocity.y = 0 }
    if (state.smoothScroll) Object.assign(state.smoothScroll, { targetX: x, targetY: y, active: true })
    else Object.assign(state.scrollOffset, { x, y })
  }
  showNotification(message, 5000, {
    onActivate: focus,
    renderContent: notification => {
      notification.append('Your ')
      const link = document.createElement('button')
      link.type = 'button'
      link.className = 'notification__inline-link'
      link.textContent = name
      link.addEventListener('click', focus)
      notification.append(link, ' caught fire!')
    }
  })
}
