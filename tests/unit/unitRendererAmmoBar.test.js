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
  PARTY_COLORS: { player1: '#00f', player: '#00f' },
  TANKER_SUPPLY_CAPACITY: 100,
  UTILITY_SERVICE_INDICATOR_SIZE: 0,
  UTILITY_SERVICE_INDICATOR_BOUNCE_SPEED: 0,
  SERVICE_DISCOVERY_RANGE: 0,
  SERVICE_SERVING_RANGE: 0,
  MINE_DEPLOY_STOP_TIME: 0,
  VIEW_FRUSTUM_MARGIN: 0,
  CURSOR_METERS_PER_TILE: 32
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
})
