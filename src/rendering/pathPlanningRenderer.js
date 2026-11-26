import { TILE_SIZE, MOVE_TARGET_INDICATOR_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { getMapOrderPreview } from '../ui/mapActions/mapOrderDraft.js'

const ROUTE_MARKER_RADIUS = 11
const ROUTE_BLUE = '#81c9ff'

function drawRouteSegment(ctx, fromX, fromY, toX, toY, directed = false, paired = false, previousMarker = false) {
  const distance = Math.hypot(toX - fromX, toY - fromY)
  if (distance === 0) return
  const dx = (toX - fromX) / distance
  const dy = (toY - fromY) / distance
  const startInset = previousMarker ? Math.min(ROUTE_MARKER_RADIUS, distance) : 0
  ctx.strokeStyle = ROUTE_BLUE
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(fromX + dx * startInset, fromY + dy * startInset)
  ctx.lineTo(toX, toY)
  ctx.stroke()
  if (!directed) return
  // A two-point loop uses opposite halves so both directions remain visible.
  const middleX = fromX + (toX - fromX) * (paired ? 0.35 : 0.5)
  const middleY = fromY + (toY - fromY) * (paired ? 0.35 : 0.5)
  ctx.beginPath()
  ctx.moveTo(middleX - dx * 5 - dy * 4, middleY - dy * 5 + dx * 4)
  ctx.lineTo(middleX + dx * 3, middleY + dy * 3)
  ctx.lineTo(middleX - dx * 5 + dy * 4, middleY - dy * 5 - dx * 4)
  ctx.stroke()
}

function drawRouteMarker(ctx, x, y, index) {
  ctx.strokeStyle = ROUTE_BLUE
  ctx.lineWidth = 1.5
  ctx.fillStyle = '#142b4a'
  ctx.beginPath()
  ctx.arc(x, y, ROUTE_MARKER_RADIUS, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(index + 1), x, y)
}

function drawRoute(ctx, points, scrollOffset, loop, width, height) {
  if (!points.length) return
  const margin = ROUTE_MARKER_RADIUS
  ctx.save()
  let previous = loop ? points.at(-1) : points[0]
  for (let i = loop ? 0 : 1; i < points.length; i++) {
    const point = points[i]
    const x1 = previous.x - scrollOffset.x
    const y1 = previous.y - scrollOffset.y
    const x2 = point.x - scrollOffset.x
    const y2 = point.y - scrollOffset.y
    if (Math.max(x1, x2) >= -margin && Math.min(x1, x2) <= width + margin &&
        Math.max(y1, y2) >= -margin && Math.min(y1, y2) <= height + margin) {
      drawRouteSegment(ctx, x1, y1, x2, y2, loop, loop && points.length === 2)
    }
    previous = point
  }
  for (let i = 0; i < points.length; i++) {
    const x = points[i].x - scrollOffset.x
    const y = points[i].y - scrollOffset.y
    if (x >= -margin && x <= width + margin && y >= -margin && y <= height + margin) drawRouteMarker(ctx, x, y, i)
  }
  ctx.restore()
}

export class PathPlanningRenderer {
  constructor() {
    this.actionBuffer = []
    this.drawnPatrols = new Set()
    this.utilityActionPool = []
    this.seenUnitTargetIds = new Set()
    this.seenWreckTargetIds = new Set()
  }

  render(ctx, units, scrollOffset, entityIndex = null, width = Infinity, height = Infinity) {
    if (!units) return

    const buildUtilityQueueActions = unit => {
      const list = this.actionBuffer
      const queue = unit.utilityQueue
      if (!queue) {
        return list
      }

      const seenUnitIds = this.seenUnitTargetIds
      const seenWreckIds = this.seenWreckTargetIds
      const pushTarget = (targetId, targetType) => {
        const seen = targetType === 'wreck' ? seenWreckIds : seenUnitIds
        if (!targetId || seen.has(targetId)) {
          return
        }
        let targetX
        let targetY
        if (targetType === 'wreck') {
          const wreck = entityIndex?.get(`wreck:${targetId}`)
          if (!wreck) {
            return
          }
          targetX = wreck.x + TILE_SIZE / 2
          targetY = wreck.y + TILE_SIZE / 2
        } else {
          const targetUnit = entityIndex?.get(`unit:${targetId}`)
          if (!targetUnit) {
            return
          }
          targetX = targetUnit.x + TILE_SIZE / 2
          targetY = targetUnit.y + TILE_SIZE / 2
        }
        seen.add(targetId)
        const poolIndex = list.length
        const action = this.utilityActionPool[poolIndex] || {
          type: 'utility',
          target: { x: 0, y: 0 }
        }
        action.type = 'utility'
        action.target.x = targetX
        action.target.y = targetY
        this.utilityActionPool[poolIndex] = action
        list.push(action)
      }

      if (queue.currentTargetId) {
        pushTarget(queue.currentTargetId, queue.currentTargetType || 'unit')
      }

      if (Array.isArray(queue.targets)) {
        queue.targets.forEach(entry => {
          if (!entry) return
          if (typeof entry === 'object') {
            pushTarget(entry.id, entry.type || 'unit')
          } else {
            pushTarget(entry, 'unit')
          }
        })
      }

      return list
    }

    const actionsForUnit = unit => {
      const list = this.actionBuffer
      list.length = 0
      this.seenUnitTargetIds.clear()
      this.seenWreckTargetIds.clear()
      if (unit.currentCommand) list.push(unit.currentCommand)
      if (unit.commandQueue && unit.commandQueue.length > 0) {
        list.push(...unit.commandQueue)
      }
      if (unit.utilityQueue && (unit.utilityQueue.currentTargetId || (unit.utilityQueue.targets && unit.utilityQueue.targets.length > 0))) {
        list.push(...buildUtilityQueueActions(unit))
      }
      return list
    }

    const drawTriangleIndicator = (screenX, screenY, idx, options = {}) => {
      const half = MOVE_TARGET_INDICATOR_SIZE / 2
      const fillStyle = options.fillStyle || 'rgba(255, 165, 0, 0.6)'
      const strokeStyle = options.strokeStyle || 'rgba(230, 150, 0, 0.9)'

      if (options.drawTriangle !== false) {
        ctx.fillStyle = fillStyle
        ctx.strokeStyle = strokeStyle

        ctx.beginPath()
        ctx.moveTo(screenX, screenY + half)
        ctx.lineTo(screenX - half, screenY - half)
        ctx.lineTo(screenX + half, screenY - half)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }

      ctx.fillStyle = options.textColor || '#000'
      ctx.font = options.font || '8px "Rajdhani", "Arial Narrow", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(idx + 1), screenX, screenY - half / 2 + 2)
    }

    this.drawnPatrols.clear()
    units.forEach(unit => {
      if (!unit.selected) return
      const patrolPoints = unit.patrol?.points
      if (patrolPoints && !this.drawnPatrols.has(patrolPoints)) {
        drawRoute(ctx, patrolPoints, scrollOffset, true, width, height)
        this.drawnPatrols.add(patrolPoints)
      }
      const queue = actionsForUnit(unit)
      if (queue.length === 0) return

      let prevX =  unit.x + TILE_SIZE / 2
      let prevY =  unit.y + TILE_SIZE / 2

      queue.forEach((action, idx) => {
        let targetX
        let targetY
        switch (action.type) {
          case 'move':
          case 'retreat':
            targetX = action.x
            targetY = action.y
            break
          case 'attack': {
            const t = action.target
            if (t.tileX !== undefined) {
              targetX = t.x + TILE_SIZE / 2
              targetY = t.y + TILE_SIZE / 2
            } else {
              targetX = (t.x + t.width / 2) * TILE_SIZE
              targetY = (t.y + t.height / 2) * TILE_SIZE
            }
            break
          }
          case 'agf': {
            const t = action.targets && action.targets[0]
            if (!t) return
            if (t.tileX !== undefined) {
              targetX = t.x + TILE_SIZE / 2
              targetY = t.y + TILE_SIZE / 2
            } else {
              targetX = (t.x + t.width / 2) * TILE_SIZE
              targetY = (t.y + t.height / 2) * TILE_SIZE
            }
            break
          }
          case 'workshopRepair': {
            let nearest = null
            let nearestDist = Infinity
            for (const ws of gameState.buildings || []) {
              if (ws.type !== 'vehicleWorkshop' || ws.owner !== gameState.humanPlayer || ws.health <= 0) continue
              const dist = Math.hypot(unit.tileX - ws.x, unit.tileY - ws.y)
              if (dist < nearestDist) { nearest = ws; nearestDist = dist }
            }
            if (!nearest) return
            targetX = (nearest.x + nearest.width / 2) * TILE_SIZE
            targetY = (nearest.y + nearest.height) * TILE_SIZE
            break
          }
          case 'deployMine':
            targetX = action.x * TILE_SIZE + TILE_SIZE / 2
            targetY = action.y * TILE_SIZE + TILE_SIZE / 2
            break
          case 'sweepArea':
            // For sweep area, we point to the first point in the path
            if (action.path && action.path.length > 0) {
              targetX = action.path[0].x * TILE_SIZE + TILE_SIZE / 2
              targetY = action.path[0].y * TILE_SIZE + TILE_SIZE / 2
            } else {
              return // No path left
            }
            break
          case 'utility': {
            const t = action.target
            if (!t) return
            targetX = t.x
            targetY = t.y
            break
          }
          default:
            return
        }

        const screenPrevX = prevX - scrollOffset.x
        const screenPrevY = prevY - scrollOffset.y
        const screenX = targetX - scrollOffset.x
        const screenY = targetY - scrollOffset.y

        ctx.save()
        if (action.type === 'move' || action.type === 'attack' || action.type === 'agf') {
          drawRouteSegment(ctx, screenPrevX, screenPrevY, screenX, screenY, false, false, idx > 0)
          drawRouteMarker(ctx, screenX, screenY, idx)
          ctx.restore()
          prevX = targetX
          prevY = targetY
          return
        }
        ctx.strokeStyle = 'rgba(255, 165, 0, 0.5)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(screenPrevX, screenPrevY)
        ctx.lineTo(screenX, screenY)
        ctx.stroke()

        if (action.type !== 'utility') {
          const markerStyle = {
            fillStyle: 'rgba(255, 165, 0, 0.6)',
            strokeStyle: 'rgba(230, 150, 0, 0.9)'
          }

          // Custom colors for mine commands
          if (action.type === 'deployMine') {
            markerStyle.fillStyle = 'rgba(255, 50, 50, 0.6)' // Reddish for mines
            markerStyle.strokeStyle = 'rgba(200, 0, 0, 0.9)'
          } else if (action.type === 'sweepArea') {
            markerStyle.fillStyle = 'rgba(200, 200, 50, 0.6)' // Yellowish for sweep
            markerStyle.strokeStyle = 'rgba(180, 180, 0, 0.9)'
          }

          drawTriangleIndicator(screenX, screenY, idx, markerStyle)
        } else {
          drawTriangleIndicator(screenX, screenY, idx, { drawTriangle: false })
        }
        ctx.restore()

        prevX = targetX
        prevY = targetY
      })
    })

    const draft = getMapOrderPreview()
    if (draft) drawRoute(ctx, draft.points, scrollOffset, draft.action === 'patrol', width, height)

    if (gameState.moveWaypointsVisible) {
      units.forEach(unit => {
        if (!unit.selected || !unit.path || unit.path.length === 0) return

        let prevX = unit.x + TILE_SIZE / 2
        let prevY = unit.y + TILE_SIZE / 2

        const localAvoidanceSteps = Math.max(0, Math.min(unit.path.length, unit.localAvoidanceRemainingSteps || 0))

        unit.path.forEach((tile, idx) => {
          const targetX = tile.x * TILE_SIZE + TILE_SIZE / 2
          const targetY = tile.y * TILE_SIZE + TILE_SIZE / 2

          const screenPrevX = prevX - scrollOffset.x
          const screenPrevY = prevY - scrollOffset.y
          const screenX = targetX - scrollOffset.x
          const screenY = targetY - scrollOffset.y
          const isLocalAvoidanceSegment = idx < localAvoidanceSteps

          ctx.save()
          ctx.strokeStyle = isLocalAvoidanceSegment
            ? 'rgba(80, 170, 255, 0.8)'
            : 'rgba(255, 165, 0, 0.5)'
          ctx.lineWidth = isLocalAvoidanceSegment ? 2 : 1
          ctx.beginPath()
          ctx.moveTo(screenPrevX, screenPrevY)
          ctx.lineTo(screenX, screenY)
          ctx.stroke()

          drawTriangleIndicator(screenX, screenY, idx, isLocalAvoidanceSegment
            ? { fillStyle: 'rgba(80, 170, 255, 0.7)', strokeStyle: 'rgba(30, 120, 230, 0.95)' }
            : undefined)
          ctx.restore()

          prevX = targetX
          prevY = targetY
        })
      })
    }

    // Render detailed sweep paths for sweepArea commands
    units.forEach(unit => {
      if (!unit.selected || !unit.commandQueue) return

      unit.commandQueue.forEach((action, _cmdIdx) => {
        if (action.type === 'sweepArea' && action.path && action.path.length > 1) {
          // Draw path line
          ctx.save()
          ctx.strokeStyle = 'rgba(255, 200, 0, 0.4)'
          ctx.lineWidth = 2
          ctx.setLineDash([4, 4])
          ctx.beginPath()

          action.path.forEach((tile, idx) => {
            const screenX = tile.x * TILE_SIZE + TILE_SIZE / 2 - scrollOffset.x
            const screenY = tile.y * TILE_SIZE + TILE_SIZE / 2 - scrollOffset.y
            if (idx === 0) {
              ctx.moveTo(screenX, screenY)
            } else {
              ctx.lineTo(screenX, screenY)
            }
          })
          ctx.stroke()
          ctx.setLineDash([])

          // Draw small numbered markers along the path (only show first 10 for clarity)
          const maxToShow = Math.min(action.path.length, 10)
          const step = Math.max(1, Math.floor(action.path.length / maxToShow))

          for (let i = 0; i < action.path.length; i += step) {
            if (i >= maxToShow) break
            const tile = action.path[i]
            const screenX = tile.x * TILE_SIZE + TILE_SIZE / 2 - scrollOffset.x
            const screenY = tile.y * TILE_SIZE + TILE_SIZE / 2 - scrollOffset.y

            // Small circle
            ctx.fillStyle = 'rgba(255, 200, 0, 0.5)'
            ctx.beginPath()
            ctx.arc(screenX, screenY, 4, 0, Math.PI * 2)
            ctx.fill()

            // Number
            ctx.fillStyle = '#000'
            ctx.font = '7px "Rajdhani", "Arial Narrow", sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(String(i + 1), screenX, screenY)
          }

          ctx.restore()
        }
      })
    })
  }
}
