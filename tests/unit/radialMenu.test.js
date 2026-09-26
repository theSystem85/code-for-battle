import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createLongPressTracker,
  hitTestRadial,
  layoutRadialItems,
  resolveRadialTiming,
  RADIAL_BUILD_BUDGET_MS
} from '../../src/ui/radialMenu/index.js'
import {
  buildProductionRadialItems,
  isProductionBuildingType
} from '../../src/ui/productionRadial/productionCatalog.js'
import { findOwnedProductionBuildingAt } from '../../src/ui/productionRadial/productionBuildingTarget.js'
import { resolveExplicitSpawnFactory } from '../../src/production/spawnFactorySelection.js'
import { gameState } from '../../src/gameState.js'
import { productionQueue } from '../../src/productionQueue.js'
import { selectProductionRadialItem, enterRadialBuildingPlan, finishRadialBlueprintDrag, cancelRadialBuildingPlan, radialPlacementGhostVisible } from '../../src/ui/productionRadial/productionRadialSelect.js'
import { createBuildingButtonHold, resolvePlanPointerUp } from '../../src/ui/productionRadial/radialBlueprintGesture.js'

function button(kind, type, options = {}) {
  const el = document.createElement('button')
  el.className = 'production-button'
  if (options.visible !== false) el.classList.add('unlocked')
  if (options.disabled) el.classList.add('disabled')
  if (options.ready) el.classList.add('ready-for-placement')
  if (options.hidden) el.style.display = 'none'
  el.setAttribute(kind === 'building' ? 'data-building-type' : 'data-unit-type', type)
  el.title = options.title || ''
  const img = document.createElement('img')
  img.setAttribute('data-src', `images/sidebar/${type}.webp`)
  img.alt = type
  el.appendChild(img)
  const name = document.createElement('span')
  name.className = kind === 'building' ? 'building-name' : 'unit-name'
  name.textContent = options.label || type
  el.appendChild(name)
  document.body.appendChild(el)
  return el
}

describe('radial menu layout and long-press', () => {
  it('fires only after the hold threshold and cancels when the pointer moves too far', () => {
    const tracker = createLongPressTracker({ holdMs: 500, moveCancelPx: 12 })
    tracker.pointerDown({ x: 10, y: 20 }, 0)
    expect(tracker.poll(499).action).toBe('track')
    expect(tracker.pointerMove({ x: 18, y: 20 }, 200).action).toBe('track')
    expect(tracker.poll(500).action).toBe('fire')
    expect(tracker.pointerUp({ x: 30, y: 40 }, 700).action).toBe('release')

    tracker.pointerDown({ x: 0, y: 0 }, 0)
    expect(tracker.pointerMove({ x: 13, y: 0 }, 100).action).toBe('cancel')
    expect(tracker.poll(600).action).toBe('idle')
    expect(tracker.pointerUp({ x: 13, y: 0 }, 600).action).toBe('cancelled')

    tracker.pointerDown({ x: 0, y: 0 }, 0)
    expect(tracker.pointerUp({ x: 2, y: 2 }, 120).action).toBe('short')
  })

  it('builds every item inside one second with ease timing that stays within the budget', () => {
    const timing = resolveRadialTiming(18, { duration: 400, stagger: 80, budgetMs: RADIAL_BUILD_BUDGET_MS })
    expect(timing.totalMs).toBeLessThanOrEqual(RADIAL_BUILD_BUDGET_MS)
    expect(timing.flyMs + timing.staggerMs * 17).toBeCloseTo(timing.totalMs)
  })

  it('hit-tests the nearest button and misses the empty center', () => {
    const layout = layoutRadialItems(4, { x: 400, y: 300 }, {
      buttonSize: 48,
      radius: 120,
      viewport: { x: 0, y: 0, width: 800, height: 600 },
      padding: 8
    })
    const first = layout.points[0]
    expect(hitTestRadial(layout.points, first.x, first.y, layout.buttonSize).index).toBe(0)
    expect(hitTestRadial(layout.points, layout.centerX, layout.centerY, layout.buttonSize)).toBeNull()
    expect(hitTestRadial(layout.points, first.x + 40, first.y, layout.buttonSize)).toBeNull()
  })

  it('keeps many buttons on screen without overlapping', () => {
    const viewport = { x: 0, y: 0, width: 390, height: 844 }
    const layout = layoutRadialItems(20, { x: 20, y: 30 }, {
      buttonSize: 48,
      radius: 96,
      gap: 8,
      padding: 10,
      viewport
    })
    const half = layout.buttonSize / 2
    layout.points.forEach(point => {
      expect(point.x - half).toBeGreaterThanOrEqual(viewport.x + 10 - 0.5)
      expect(point.y - half).toBeGreaterThanOrEqual(viewport.y + 10 - 0.5)
      expect(point.x + half).toBeLessThanOrEqual(viewport.x + viewport.width - 10 + 0.5)
      expect(point.y + half).toBeLessThanOrEqual(viewport.y + viewport.height - 10 + 0.5)
    })
    for (let i = 0; i < layout.points.length; i += 1) {
      for (let j = i + 1; j < layout.points.length; j += 1) {
        const distance = Math.hypot(
          layout.points[i].x - layout.points[j].x,
          layout.points[i].y - layout.points[j].y
        )
        expect(distance).toBeGreaterThanOrEqual(layout.buttonSize - 0.5)
      }
    }
  })
})

describe('production radial items', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('builds sidebar-visible options per factory and keeps disabled states', () => {
    button('building', 'powerPlant', { label: 'Power Plant' })
    button('building', 'turretGunV3', { hidden: true })
    button('building', 'concreteWall', { disabled: true, title: 'Requires Power Plant' })
    button('unit', 'tank', { label: 'Tank V1' })
    button('unit', 'apache', { label: 'Apache' })
    button('unit', 'f22Raptor')
    button('unit', 'f35', { disabled: true, title: 'Requires ammunition' })
    button('unit', 'destroyer')
    button('unit', 'harvester', { visible: false })

    const yard = buildProductionRadialItems('constructionYard')
    expect(yard.map(item => item.type)).toEqual(['powerPlant', 'concreteWall'])
    expect(yard.find(item => item.type === 'concreteWall').disabled).toBe(true)
    expect(yard.find(item => item.type === 'powerPlant').icon).toBe('images/sidebar/powerPlant.webp')

    expect(buildProductionRadialItems('vehicleFactory').map(item => item.type)).toEqual(['tank'])
    expect(buildProductionRadialItems('helipad').map(item => item.type)).toEqual(['apache', 'f35'])
    expect(buildProductionRadialItems('helipad').find(item => item.type === 'f35').disabled).toBe(true)
    expect(buildProductionRadialItems('airstrip').map(item => item.type)).toEqual(['f22Raptor', 'f35'])
    expect(buildProductionRadialItems('shipyard').map(item => item.type)).toEqual(['destroyer'])
    expect(buildProductionRadialItems('hospital')).toEqual([])
    expect(isProductionBuildingType('vehicleFactory')).toBe(true)
    expect(isProductionBuildingType('hospital')).toBe(false)
  })

  it('finds the player production building under the pointer and ignores enemies', () => {
    const yard = { type: 'constructionYard', owner: 'player1', health: 100, x: 4, y: 6, width: 3, height: 3 }
    const enemy = { type: 'vehicleFactory', owner: 'player2', health: 100, x: 4, y: 6, width: 3, height: 3 }
    const found = findOwnedProductionBuildingAt(4.2 * 32, 6.2 * 32, {
      buildings: [enemy, yard],
      factories: [],
      owner: 'player1'
    })
    expect(found).toBe(yard)
    expect(findOwnedProductionBuildingAt(1, 1, {
      buildings: [yard],
      factories: [],
      owner: 'player1'
    })).toBeNull()
  })
})

describe('radial production commands', () => {
  const originalAddItem = productionQueue.addItem
  const originalEnablePlacement = productionQueue.enableBuildingPlacementMode

  beforeEach(() => {
    gameState.gamePaused = false
    gameState.buildingPlacementMode = false
    gameState.humanPlayer = 'player'
    productionQueue.addItem = vi.fn()
    productionQueue.enableBuildingPlacementMode = vi.fn(() => true)
  })

  afterEach(() => {
    productionQueue.addItem = originalAddItem
    productionQueue.enableBuildingPlacementMode = originalEnablePlacement
  })

  it('queues a unit on the chosen factory and places buildings through the sidebar path', () => {
    const unitButton = { classList: { contains: () => false } }
    const buildingButton = {
      classList: { contains: (name) => name === 'ready-for-placement' }
    }
    const factory = { id: 'vf-2', type: 'vehicleFactory' }

    expect(selectProductionRadialItem({
      kind: 'unit',
      type: 'tank',
      disabled: false,
      button: unitButton
    }, factory)).toBe(true)
    expect(productionQueue.addItem).toHaveBeenCalledWith('tank', unitButton, false, null, null, {
      factoryId: 'vf-2'
    })

    expect(selectProductionRadialItem({
      kind: 'building',
      type: 'powerPlant',
      disabled: false,
      ready: true,
      button: buildingButton
    }, { id: 'yard' })).toBe(true)
    expect(productionQueue.enableBuildingPlacementMode).toHaveBeenCalledWith('powerPlant', buildingButton)
  })

  it('prefers an explicit factory id and falls back when that factory is gone', () => {
    const first = { id: 'vf-1' }
    const second = { id: 'vf-2' }
    expect(resolveExplicitSpawnFactory([first, second], [first, second], 'vf-2')).toEqual({
      status: 'chosen',
      factory: second
    })
    expect(resolveExplicitSpawnFactory([first], [first], 'missing').status).toBe('fallback')
    expect(resolveExplicitSpawnFactory([first, second], [first], 'vf-2').status).toBe('unavailable')
  })
})

describe('radial blueprint drag', () => {
  const originalAddItem = productionQueue.addItem
  const buildingButton = { classList: { contains: () => false } }
  const powerPlant = {
    id: 'building:powerPlant',
    kind: 'building',
    type: 'powerPlant',
    disabled: false,
    button: buildingButton
  }
  const tank = {
    id: 'unit:tank',
    kind: 'unit',
    type: 'tank',
    disabled: false,
    button: buildingButton
  }

  beforeEach(() => {
    gameState.gamePaused = false
    gameState.buildingPlacementMode = false
    gameState.currentBuildingType = null
    gameState.radialBuildingPlan = null
    gameState.blueprints = []
    gameState.humanPlayer = 'player'
    productionQueue.addItem = vi.fn()
  })

  afterEach(() => {
    productionQueue.addItem = originalAddItem
    gameState.radialBuildingPlan = null
    gameState.buildingPlacementMode = false
    gameState.currentBuildingType = null
    gameState.blueprints = []
  })

  it('arms a building button for 500ms and ignores unit buttons', () => {
    const hold = createBuildingButtonHold(500)
    expect(hold.track(tank, 0)).toEqual({ phase: 'idle', progress: 0, item: null })
    expect(hold.track(powerPlant, 1000)).toMatchObject({ phase: 'arming', progress: 0 })
    expect(hold.poll(1499).phase).toBe('arming')
    expect(hold.poll(1499).progress).toBeCloseTo(0.998, 2)
    const fired = hold.poll(1500)
    expect(fired.phase).toBe('fire')
    expect(fired.item).toBe(powerPlant)
    expect(hold.poll(2000).phase).toBe('idle')
  })

  it('resets the building hold when the pointer leaves the button', () => {
    const hold = createBuildingButtonHold(500)
    hold.track(powerPlant, 0)
    expect(hold.poll(400).phase).toBe('arming')
    expect(hold.track(tank, 450).phase).toBe('idle')
    expect(hold.track(powerPlant, 450)).toMatchObject({ phase: 'arming', progress: 0 })
    expect(hold.poll(949).phase).toBe('arming')
    expect(hold.poll(950).phase).toBe('fire')
  })

  it('places a blueprint on a valid drag release and keeps planning when the tile is invalid', () => {
    expect(enterRadialBuildingPlan(powerPlant)).toBe(true)
    expect(productionQueue.addItem).not.toHaveBeenCalled()
    expect(gameState.buildingPlacementMode).toBe(true)
    expect(gameState.radialBuildingPlan.type).toBe('powerPlant')

    expect(resolvePlanPointerUp({ overUi: false, canPlace: false })).toBe('invalid')
    expect(finishRadialBlueprintDrag(gameState.radialBuildingPlan, {
      overUi: false,
      canPlace: false,
      tileX: 4,
      tileY: 5
    })).toBe('invalid')
    expect(productionQueue.addItem).not.toHaveBeenCalled()
    expect(gameState.buildingPlacementMode).toBe(true)
    expect(gameState.radialBuildingPlan.type).toBe('powerPlant')

    expect(finishRadialBlueprintDrag(gameState.radialBuildingPlan, {
      overUi: false,
      canPlace: true,
      tileX: 8,
      tileY: 9
    })).toBe('place')
    expect(productionQueue.addItem).toHaveBeenCalledWith('powerPlant', buildingButton, true, {
      type: 'powerPlant',
      x: 8,
      y: 9
    })
    expect(gameState.blueprints).toEqual([{ type: 'powerPlant', x: 8, y: 9 }])
    expect(gameState.buildingPlacementMode).toBe(false)
    expect(gameState.currentBuildingType).toBeNull()
    expect(gameState.radialBuildingPlan).toBeNull()
    expect(radialPlacementGhostVisible()).toBe(false)
  })

  it('clears the placement ghost after a successful place from both radial flows', () => {
    const place = (tileX, tileY) => finishRadialBlueprintDrag(gameState.radialBuildingPlan, {
      overUi: false,
      canPlace: true,
      tileX,
      tileY
    })
    const expectGhostGone = () => {
      expect(gameState.buildingPlacementMode).toBe(false)
      expect(gameState.currentBuildingType).toBeNull()
      expect(gameState.radialBuildingPlan).toBeNull()
      expect(gameState.draggedBuildingType).toBeNull()
      expect(radialPlacementGhostVisible()).toBe(false)
    }

    enterRadialBuildingPlan(powerPlant)
    expect(radialPlacementGhostVisible()).toBe(true)
    expect(place(2, 3)).toBe('place')
    expectGhostGone()

    const hold = createBuildingButtonHold(500)
    hold.track(powerPlant, 0)
    const fired = hold.poll(500)
    expect(fired.phase).toBe('fire')
    expect(fired.item.type).toBe('powerPlant')
    enterRadialBuildingPlan(fired.item)
    expect(radialPlacementGhostVisible()).toBe(true)
    expect(place(6, 7)).toBe('place')
    expectGhostGone()
    expect(productionQueue.addItem).toHaveBeenCalledTimes(2)
  })

  it('clears the placement ghost when planning is canceled', () => {
    enterRadialBuildingPlan(powerPlant)
    gameState.draggedBuildingType = 'powerPlant'
    expect(cancelRadialBuildingPlan()).toBe(true)
    expect(gameState.buildingPlacementMode).toBe(false)
    expect(gameState.currentBuildingType).toBeNull()
    expect(gameState.radialBuildingPlan).toBeNull()
    expect(gameState.draggedBuildingType).toBeNull()
    expect(radialPlacementGhostVisible()).toBe(false)
  })

  it('cancels planning when the drag ends over UI and leaves unit production on release', () => {
    enterRadialBuildingPlan(powerPlant)
    expect(finishRadialBlueprintDrag(gameState.radialBuildingPlan, {
      overUi: true,
      canPlace: true,
      tileX: 1,
      tileY: 1
    })).toBe('cancel')
    expect(productionQueue.addItem).not.toHaveBeenCalled()
    expect(gameState.buildingPlacementMode).toBe(false)
    expect(gameState.radialBuildingPlan).toBeNull()

    expect(selectProductionRadialItem(tank, { id: 'vf-2' })).toBe(true)
    expect(productionQueue.addItem).toHaveBeenCalledWith('tank', buildingButton, false, null, null, {
      factoryId: 'vf-2'
    })
    expect(gameState.radialBuildingPlan).toBeNull()
  })
})
