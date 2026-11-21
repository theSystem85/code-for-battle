import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { isPositionVisibleToPlayer } from '../game/shadowOfWar.js'
import { getTileDensity } from '../game/harvesterEligibility.js'
import { getConnectedOreValue, getRemainingOreValue, HARVESTER_BASE_CARGO_VALUE } from '../game/oreValue.js'
import { getMapMutationRevisionStore } from '../rendering/prepared/mapMutationNotifier.js'
import { RENDER_REVISION_DOMAINS } from '../rendering/prepared/renderRevisionStore.js'

const formatValue = new Intl.NumberFormat()

export function setupOreTooltip(canvas, mapGrid) {
  const tooltip = document.createElement('div')
  tooltip.className = 'ore-tooltip'
  tooltip.setAttribute('role', 'tooltip')
  tooltip.hidden = true
  document.body.append(tooltip)

  let pointerX, pointerY
  let timer
  let previousTile, previousX, previousY, previousLevel, previousRevision

  function hide() {
    tooltip.hidden = true
    previousTile = null
    window.clearInterval(timer)
    timer = undefined
  }

  function refresh() {
    const rect = canvas.getBoundingClientRect()
    if (gameState.isRightDragging || pointerX < rect.left || pointerX >= rect.right ||
        pointerY < rect.top || pointerY >= rect.bottom) {
      hide()
      return
    }

    const x = Math.floor((pointerX - rect.left + gameState.scrollOffset.x) / TILE_SIZE)
    const y = Math.floor((pointerY - rect.top + gameState.scrollOffset.y) / TILE_SIZE)
    const tile = mapGrid[y]?.[x]
    if ((!tile?.ore && !tile?.seedCrystal) ||
        !isPositionVisibleToPlayer(gameState, mapGrid, (x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE)) {
      hide()
      return
    }

    const level = getTileDensity(tile, tile.seedCrystal)
    const revision = tile.seedCrystal
      ? getMapMutationRevisionStore()?.getGeneration(RENDER_REVISION_DOMAINS.RESOURCE)
      : undefined
    if (tile !== previousTile || x !== previousX || y !== previousY ||
        level !== previousLevel || revision !== previousRevision) {
      tooltip.textContent = tile.seedCrystal
        ? `Seed crystal · Level ${level}\nConnected ore: ${formatValue.format(getConnectedOreValue(mapGrid, x, y))} credits`
        : `Ore crystals · Level ${level}\nNext harvest: ${formatValue.format(HARVESTER_BASE_CARGO_VALUE * level)} credits\nTile total: ${formatValue.format(getRemainingOreValue(tile))} credits`
      previousTile = tile
      previousX = x
      previousY = y
      previousLevel = level
      previousRevision = revision
    }
    tooltip.hidden = false
  }

  canvas.addEventListener('mousemove', event => {
    if (event.buttons) {
      hide()
      return
    }
    pointerX = event.clientX
    pointerY = event.clientY
    refresh()
    if (tooltip.hidden) return

    // Leave room for the pointer and keep the tooltip within the viewport.
    tooltip.style.left = `${Math.max(0, Math.min(pointerX + 16, window.innerWidth - 240))}px`
    tooltip.style.top = `${pointerY}px`
    tooltip.classList.toggle('ore-tooltip--above', pointerY + 90 > window.innerHeight)
    timer ??= window.setInterval(refresh, 250)
  })
  canvas.addEventListener('mousedown', hide)
  canvas.addEventListener('mouseleave', hide)
  window.addEventListener('blur', hide)
}
