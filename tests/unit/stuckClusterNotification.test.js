import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

vi.mock('../../src/inputHandler.js', () => ({
  selectedUnits: []
}))

vi.mock('../../src/utils/layoutMetrics.js', () => ({
  getPlayableViewportWidth: () => 800,
  getPlayableViewportHeight: () => 600
}))

import { selectedUnits } from '../../src/inputHandler.js'
import { showNotification } from '../../src/ui/notifications.js'
import { reportPlayerStuckCluster } from '../../src/game/movementPatience.js'
import {
  resetStuckClusterNoticeForTests,
  showStuckClusterNotification
} from '../../src/game/stuckClusterNotification.js'

function stuckMember(id, x, y) {
  return {
    id,
    owner: 'player1',
    type: 'tankerTruck',
    health: 100,
    x,
    y,
    selected: false,
    moveTarget: { x: 30, y: 30 },
    movePatience: {
      remaining: 10,
      immobile: true,
      expiredAt: 4000,
      targetX: 30,
      targetY: 30,
      lastX: x,
      lastY: y,
      nextCheckTime: 999999,
      phase: 0
    }
  }
}

function pile(count, tileX = 12, tileY = 9) {
  return Array.from({ length: count }, (_, index) => (
    stuckMember(`stuck-${index}`, tileX * TILE_SIZE + index, tileY * TILE_SIZE)
  ))
}

describe('stuck cluster notification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStuckClusterNoticeForTests()
    selectedUnits.length = 0
    document.body.innerHTML = ''
  })

  it('[U06545] shows a goto link that selects and centers the stuck player units', () => {
    const units = pile(6)
    const old = { id: 'old', selected: true, health: 100, x: 0, y: 0 }
    selectedUnits.push(old)
    const canvas = document.createElement('canvas')
    canvas.id = 'gameCanvas'
    document.body.appendChild(canvas)
    const mapGrid = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => ({ type: 'grass' })))
    const gameState = {
      humanPlayer: 'player1',
      units,
      factories: [{ selected: true }],
      mapGrid,
      dragVelocity: { x: 4, y: 4 },
      smoothScroll: { targetX: 0, targetY: 0, active: false },
      scrollOffset: { x: 0, y: 0 }
    }

    const cluster = reportPlayerStuckCluster(units[0], units, gameState, 4000)

    expect(cluster.members).toHaveLength(6)
    expect(showNotification).toHaveBeenCalledTimes(1)
    const [message, duration, options] = showNotification.mock.calls[0]
    expect(message).toBe('6 of your units are stuck')
    expect(duration).toBe(6000)
    expect(options.historyMessage).toBe(message)

    const host = document.createElement('div')
    options.renderContent(host)
    const link = host.querySelector('button')
    expect(link.textContent).toBe('Go to units')
    link.click()

    expect(old.selected).toBe(false)
    expect(selectedUnits).toEqual(units)
    expect(units.every(unit => unit.selected)).toBe(true)
    expect(gameState.factories[0].selected).toBe(false)
    expect(gameState.dragVelocity).toEqual({ x: 0, y: 0 })
    expect(gameState.smoothScroll.active).toBe(true)
    const centerX = units.reduce((sum, unit) => sum + unit.x + TILE_SIZE / 2, 0) / units.length
    expect(gameState.smoothScroll.targetX).toBeCloseTo(centerX - 400, 5)
  })

  it('[U06546] does not repeat the notice for the same crowd inside the cooldown', () => {
    const units = pile(6)
    const gameState = { humanPlayer: 'player1', units }
    const cluster = reportPlayerStuckCluster(units[0], units, gameState, 4000)

    expect(showStuckClusterNotification(cluster, gameState, 5000)).toBe(false)
    expect(showNotification).toHaveBeenCalledTimes(1)

    showStuckClusterNotification({
      members: units,
      center: { x: 0, y: 8000 }
    }, gameState, 6000)
    expect(showNotification).toHaveBeenCalledTimes(2)
  })

  it('[U06547] stays quiet for five units and for enemy crowds', () => {
    const five = pile(5)
    const gameState = { humanPlayer: 'player1', units: five }
    expect(reportPlayerStuckCluster(five[0], five, gameState, 4000)).toBeNull()

    const enemies = pile(6).map(unit => ({ ...unit, owner: 'enemy' }))
    expect(reportPlayerStuckCluster(enemies[0], enemies, gameState, 4000)).toBeNull()
    expect(showNotification).not.toHaveBeenCalled()
  })
})
