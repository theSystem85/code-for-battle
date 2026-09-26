import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32,
  HARVESTER_CAPPACITY: 100,
  HARVESTER_UNLOAD_TIME: 1000,
  RECOIL_DISTANCE: 0,
  RECOIL_DURATION: 0,
  MUZZLE_FLASH_DURATION: 0,
  MUZZLE_FLASH_SIZE: 0,
  TANK_FIRE_RANGE: 0,
  ATTACK_TARGET_INDICATOR_SIZE: 0,
  ATTACK_TARGET_BOUNCE_SPEED: 0,
  UNIT_TYPE_COLORS: {},
  PARTY_COLORS: { player1: '#00f', player2: '#FF0000', player: '#00f' },
  TANKER_SUPPLY_CAPACITY: 100,
  UTILITY_SERVICE_INDICATOR_SIZE: 0,
  UTILITY_SERVICE_INDICATOR_BOUNCE_SPEED: 0,
  SERVICE_DISCOVERY_RANGE: 0,
  SERVICE_SERVING_RANGE: 0,
  MINE_DEPLOY_STOP_TIME: 0,
  VIEW_FRUSTUM_MARGIN: 0,
  CURSOR_METERS_PER_TILE: 32,
  BATTLESHIP_FIRE_RANGE: 32 * 36,
  SUBMARINE_TORPEDO_RANGE: 32 * 16,
  MOBILE_CANVAS_PIXEL_RATIO_CAP: 1
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    buildings: [
      { id: 'airstrip-1', type: 'airstrip', ammo: 200, maxAmmo: 250 },
      { id: 'helipad-1', type: 'helipad', ammo: 220, maxAmmo: 250 }
    ]
  }
}))

vi.mock('../../src/inputHandler.js', () => ({ selectedUnits: [] }))

vi.mock('../../src/rendering/tankImageRenderer.js', () => ({ renderTankWithImages: vi.fn(() => false), areTankImagesLoaded: vi.fn(() => false) }))
vi.mock('../../src/rendering/harvesterImageRenderer.js', () => ({ renderHarvesterWithImage: vi.fn(() => false), isHarvesterImageLoaded: vi.fn(() => false) }))
vi.mock('../../src/rendering/rocketTankImageRenderer.js', () => ({ renderRocketTankWithImage: vi.fn(() => false), isRocketTankImageLoaded: vi.fn(() => false) }))
vi.mock('../../src/rendering/howitzerImageRenderer.js', () => ({ renderHowitzerWithImage: vi.fn(() => false), isHowitzerImageLoaded: vi.fn(() => false) }))
vi.mock('../../src/rendering/ambulanceImageRenderer.js', () => ({ renderAmbulanceWithImage: vi.fn(() => false), isAmbulanceImageLoaded: vi.fn(() => false) }))
vi.mock('../../src/rendering/tankerTruckImageRenderer.js', () => ({ renderTankerTruckWithImage: vi.fn(() => false), isTankerTruckImageLoaded: vi.fn(() => false) }))
vi.mock('../../src/rendering/recoveryTankImageRenderer.js', () => ({ renderRecoveryTankWithImage: vi.fn(() => false), isRecoveryTankImageLoaded: vi.fn(() => false) }))
vi.mock('../../src/rendering/ammunitionTruckImageRenderer.js', () => ({ renderAmmunitionTruckWithImage: vi.fn(() => false), isAmmunitionTruckImageLoaded: vi.fn(() => false) }))
vi.mock('../../src/rendering/mineLayerImageRenderer.js', () => ({ renderMineLayerWithImage: vi.fn(() => false), isMineLayerImageLoaded: vi.fn(() => false) }))
vi.mock('../../src/rendering/mineSweeperImageRenderer.js', () => ({ renderMineSweeperWithImage: vi.fn(() => false), isMineSweeperImageLoaded: vi.fn(() => false) }))
vi.mock('../../src/rendering/apacheImageRenderer.js', () => ({ renderApacheWithImage: vi.fn(() => false) }))
vi.mock('../../src/rendering/f22ImageRenderer.js', () => ({ renderF22WithImage: vi.fn(() => false) }))
vi.mock('../../src/rendering/f35ImageRenderer.js', () => ({ renderF35WithImage: vi.fn(() => false) }))
vi.mock('../../src/utils.js', () => ({
  getExperienceProgress: vi.fn(() => 0),
  initializeUnitLeveling: vi.fn(),
  getBuildingIdentifier: vi.fn(building => building.id)
}))

vi.mock('../../src/game/time.js', () => ({
  getSimulationTime: vi.fn(() => 10000)
}))

import { gameState } from '../../src/gameState.js'
import { UnitRenderer } from '../../src/rendering/unitRenderer.js'

describe('UnitRenderer ammo HUD consistency', () => {
  beforeEach(() => {
    globalThis.Image = class {
      set src(_value) {}
    }
    globalThis.window = { logger: { warn: vi.fn() } }
  })

  it('uses apache rocketAmmo for the selected ammo bar even while landed on a helipad', () => {
    const renderer = new UnitRenderer()
    const drawHudEdgeBar = vi.spyOn(renderer, 'drawHudEdgeBar').mockImplementation(() => {})
    const unit = {
      id: 'apache-1',
      selected: true,
      type: 'apache',
      owner: 'player1',
      x: 0,
      y: 0,
      rocketAmmo: 4,
      maxRocketAmmo: 8,
      landedHelipadId: 'helipad-1',
      flightState: 'grounded'
    }

    renderer.renderAmmunitionBar({}, unit, { x: 0, y: 0 })

    expect(drawHudEdgeBar).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'left', 0.5, '#FFA500')
  })

  it('skips an offscreen battleship range perimeter instead of filling the viewport', () => {
    const renderer = new UnitRenderer()
    const ctx = {
      canvas: {
        width: 2000,
        height: 1400,
        clientWidth: 1000,
        clientHeight: 700,
        getBoundingClientRect: () => ({ width: 1000, height: 700 })
      },
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn()
    }
    const battleship = { type: 'battleship', isNaval: true, selected: true }

    renderer.renderNavalWeaponRange(ctx, battleship, 500, 350)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.arc).not.toHaveBeenCalled()
    expect(ctx.fill).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('renders a visible naval range boundary as a stroke without a large alpha fill', () => {
    const renderer = new UnitRenderer()
    const ctx = {
      canvas: {
        width: 2000,
        height: 1400,
        clientWidth: 1000,
        clientHeight: 700,
        getBoundingClientRect: () => ({ width: 1000, height: 700 })
      },
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn()
    }
    const battleship = { type: 'battleship', isNaval: true, selected: true }

    renderer.renderNavalWeaponRange(ctx, battleship, -300, 350)

    expect(ctx.arc).toHaveBeenCalledWith(-300, 350, 32 * 36, 0, Math.PI * 2)
    expect(ctx.stroke).toHaveBeenCalledOnce()
    expect(ctx.fill).not.toHaveBeenCalled()
    expect(ctx.setLineDash).not.toHaveBeenCalled()
  })

  it('sizes the Destroyer HUD beyond the full rendered ship length', () => {
    const renderer = new UnitRenderer()
    const standardBounds = renderer.getSelectedHudBounds(100, 100, { type: 'tank_v1' })
    const destroyerBounds = renderer.getSelectedHudBounds(100, 100, { type: 'destroyer' })

    expect(destroyerBounds.width).toBeGreaterThan(32 * 2.6)
    expect(destroyerBounds.height).toBe(destroyerBounds.width)
    expect(destroyerBounds.width).toBeGreaterThan(standardBounds.width)
  })

  it('summarizes embarked vehicle types in the transport loading tooltip', () => {
    const renderer = new UnitRenderer()
    const ferry = {
      type: 'vehicleFerry',
      transportCapacity: 10,
      embarkedUnitIds: ['tank-1', 'ambulance-1', 'tank-2'],
      embarkedUnitTypes: ['tank_v1', 'ambulance', 'tank_v1']
    }

    expect(renderer.getHudAbsoluteTooltipText(ferry, 'cargo')).toBe('loaded 3/10\n1× ambulance\n2× tank-v1')
  })

  it('uses F22 rocketAmmo for the selected ammo bar even while parked on an airstrip', () => {
    const renderer = new UnitRenderer()
    const drawHudEdgeBar = vi.spyOn(renderer, 'drawHudEdgeBar').mockImplementation(() => {})
    const unit = {
      id: 'f22-1',
      selected: true,
      type: 'f22Raptor',
      owner: 'player1',
      x: 0,
      y: 0,
      rocketAmmo: 2,
      maxRocketAmmo: 8,
      landedHelipadId: 'airstrip-1',
      flightState: 'grounded',
      lastShotTime: 0,
      volleyState: null
    }

    renderer.renderAmmunitionBar({}, unit, { x: 0, y: 0 })

    expect(drawHudEdgeBar).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'left', 0.25, '#FFA500')
  })

  it('keeps units renderable during destruction freeze delay even at 0 HP', () => {
    const renderer = new UnitRenderer()
    const result = renderer.shouldRenderUnit(
      {
        health: 0,
        destructionQueuedAt: 1000,
        destructionExplosionSpawned: false,
        x: 0,
        y: 0
      },
      { x: 0, y: 0 },
      1280,
      720
    )

    expect(result).toBe(true)
  })

  it('does not render a health bar while a destroyed unit is in freeze delay', () => {
    const renderer = new UnitRenderer()
    const drawHudEdgeBar = vi.spyOn(renderer, 'drawHudEdgeBar').mockImplementation(() => {})
    const ctx = {
      fillRect: vi.fn(),
      strokeRect: vi.fn()
    }

    renderer.renderHealthBar(
      ctx,
      {
        selected: true,
        owner: 'player1',
        x: 0,
        y: 0,
        health: 0,
        maxHealth: 100,
        destructionQueuedAt: 1000,
        destructionExplosionSpawned: false
      },
      { x: 0, y: 0 }
    )

    expect(drawHudEdgeBar).not.toHaveBeenCalled()
    expect(ctx.fillRect).not.toHaveBeenCalled()
    expect(ctx.strokeRect).not.toHaveBeenCalled()
  })

  it('prioritizes active harvester harvest progress over XP in the selected bottom HUD slot', () => {
    const renderer = new UnitRenderer()
    const drawHudEdgeBar = vi.spyOn(renderer, 'drawHudEdgeBar').mockImplementation(() => {})

    renderer.renderHarvesterProgress(
      {},
      {
        id: 'harvester-1',
        selected: true,
        type: 'harvester',
        owner: 'player1',
        x: 0,
        y: 0,
        harvesting: true,
        harvestTimer: 5000,
        level: 1,
        experience: 3
      },
      { x: 0, y: 0 }
    )

    expect(drawHudEdgeBar).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'bottom', 0.5, '#32CD32')
  })

  it('splits the Supply Ship donut supply quarter into ammo, fuel, and repair arcs', () => {
    const renderer = new UnitRenderer()
    const strokes = []
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      stroke() {
        strokes.push({
          style: this.strokeStyle,
          args: ctx.arc.mock.calls[ctx.arc.mock.calls.length - 1]
        })
      },
      lineCap: 'butt',
      lineWidth: 4,
      strokeStyle: ''
    }
    const unit = {
      type: 'supplyShip',
      supplyAmmo: 60,
      maxSupplyAmmo: 120,
      supplyFuel: 1500,
      maxSupplyFuel: 3000,
      supplyRepairTools: 130,
      maxSupplyRepairTools: 260
    }

    renderer.drawSupplyShipHudBar(ctx, {
      left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100
    }, unit)

    const tracks = strokes.filter(stroke => stroke.style === 'rgba(0, 0, 0, 0.95)')
    expect(tracks).toHaveLength(3)
    const starts = tracks.map(stroke => stroke.args[3])
    expect(starts[1] - starts[0]).toBeCloseTo(starts[2] - starts[1])

    const fills = strokes.filter(stroke => String(stroke.style).startsWith('rgb('))
    expect(fills).toHaveLength(3 * 8)
    tracks.forEach((track, group) => {
      const groupFills = fills.slice(group * 8, (group + 1) * 8)
      const sweep = track.args[4] - track.args[3]
      expect(groupFills[0].args[3]).toBeCloseTo(track.args[3])
      expect(groupFills[7].args[4]).toBeCloseTo(track.args[3] + sweep * 0.5)
      const startGreen = Number(groupFills[0].style.match(/rgb\((\d+), (\d+), (\d+)\)/)[2])
      const endGreen = Number(groupFills[7].style.match(/rgb\((\d+), (\d+), (\d+)\)/)[2])
      expect(endGreen).toBeGreaterThan(startGreen)
    })
  })

  it('renders the selected Supply Ship support radius from its configured tile range', () => {
    const renderer = new UnitRenderer()
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      setLineDash: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      set strokeStyle(_value) {},
      set lineWidth(_value) {}
    }

    renderer.renderUtilityServiceRange(ctx, {
      type: 'supplyShip',
      selected: true,
      supplyRadiusTiles: 2
    }, 100, 120)

    expect(ctx.arc).toHaveBeenCalledWith(100, 120, 64, 0, Math.PI * 2)
  })

  it('draws an inward party-colored glow for the circular selected-unit HUD', () => {
    gameState.selectionHudMode = 'modern-donut'
    const renderer = new UnitRenderer()
    const gradient = { addColorStop: vi.fn() }
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      createRadialGradient: vi.fn(() => gradient)
    }

    renderer.renderSelection(ctx, {
      selected: true,
      owner: 'player2',
      type: 'tank_v1'
    }, 100, 80)

    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(1)
    const [x0, y0, innerRadius, x1, y1, outerRadius] = ctx.createRadialGradient.mock.calls[0]
    expect(x0).toBe(100)
    expect(y0).toBe(80)
    expect(x1).toBe(100)
    expect(y1).toBe(80)
    expect(innerRadius).toBeGreaterThan(0)
    expect(innerRadius).toBeLessThan(outerRadius)
    expect(ctx.arc).toHaveBeenCalledWith(100, 80, outerRadius, 0, Math.PI * 2)
    expect(ctx.arc).toHaveBeenCalledWith(100, 80, innerRadius, 0, Math.PI * 2, true)
    expect(ctx.fill).toHaveBeenCalledWith('evenodd')

    const stopColors = gradient.addColorStop.mock.calls.map(call => call[1])
    expect(stopColors[0]).toBe('rgba(255, 0, 0, 0)')
    expect(stopColors.at(-1)).toContain('rgba(255, 0, 0,')
    const alphas = stopColors.map(color => Number(color.match(/rgba\(\d+, \d+, \d+, ([0-9.]+)\)/)[1]))
    expect(Math.max(...alphas)).toBeGreaterThan(alphas[0])
    expect(Math.max(...alphas)).toBeGreaterThan(alphas.at(-1))
    expect(alphas[1]).toBeLessThan(alphas[3])
  })

  it('does not draw the inward glow unless the circular HUD is selected', () => {
    gameState.selectionHudMode = 'modern'
    const renderer = new UnitRenderer()
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      stroke: vi.fn(),
      createRadialGradient: vi.fn(),
      set strokeStyle(_value) {},
      set lineWidth(_value) {}
    }

    renderer.renderSelection(ctx, {
      selected: true,
      owner: 'player2',
      type: 'tank_v1'
    }, 100, 80)
    renderer.renderSelection(ctx, {
      selected: false,
      owner: 'player2',
      type: 'tank_v1'
    }, 100, 80)

    expect(ctx.createRadialGradient).not.toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
    gameState.selectionHudMode = 'modern-donut'
  })
})
