export const RADIAL_BUILDING_HOLD_MS = 500

function isArmableBuilding(item) {
  return Boolean(item && item.kind === 'building' && !item.disabled)
}

export function createBuildingButtonHold(holdMs = RADIAL_BUILDING_HOLD_MS) {
  let id = null
  let startedAt = 0
  let item = null

  const idle = () => ({ phase: 'idle', progress: 0, item: null })

  return {
    track(next, time) {
      const building = isArmableBuilding(next) ? next : null
      if (!building) {
        id = null
        item = null
        return idle()
      }
      if (id !== building.id) {
        id = building.id
        item = building
        startedAt = time
        return { phase: 'arming', progress: 0, item: building }
      }
      return this.poll(time)
    },
    poll(time) {
      if (id == null) return idle()
      const progress = Math.min(1, (time - startedAt) / holdMs)
      if (progress >= 1) {
        const fired = item
        id = null
        item = null
        return { phase: 'fire', progress: 1, item: fired }
      }
      return { phase: 'arming', progress, item }
    },
    reset() {
      id = null
      item = null
      startedAt = 0
    }
  }
}

export function resolvePlanPointerUp({ overUi, canPlace }) {
  if (overUi) return 'cancel'
  if (!canPlace) return 'invalid'
  return 'place'
}

export function tileFromClient(clientX, clientY, rect, scrollOffset, tileSize) {
  const worldX = clientX - rect.left + (scrollOffset?.x || 0)
  const worldY = clientY - rect.top + (scrollOffset?.y || 0)
  return {
    worldX,
    worldY,
    tileX: Math.floor(worldX / tileSize),
    tileY: Math.floor(worldY / tileSize)
  }
}
