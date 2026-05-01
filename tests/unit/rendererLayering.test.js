import { beforeEach, describe, expect, it, vi } from 'vitest'

const createSimpleRendererClass = (methods = {}) => class {
  constructor() {
    Object.assign(this, methods)
  }
}

vi.mock('../../src/rendering/textureManager.js', () => ({
  TextureManager: class {
    constructor() {
      this.loadingStarted = true
      this.preloadAllTextures = vi.fn()
    }
  }
}))

vi.mock('../../src/rendering/mapRenderer.js', () => ({
  MapRenderer: createSimpleRendererClass({
    render: vi.fn()
  })
}))

vi.mock('../../src/rendering/buildingRenderer.js', () => ({
  BuildingRenderer: createSimpleRendererClass({
    renderBases: vi.fn(),
    renderOverlays: vi.fn(),
    renderHudHoverTooltip: vi.fn()
  })
}))

vi.mock('../../src/rendering/unitRenderer.js', () => ({
  UnitRenderer: createSimpleRendererClass({
    renderBases: vi.fn(),
    renderOverlays: vi.fn()
  })
}))

vi.mock('../../src/rendering/effectsRenderer.js', () => ({
  EffectsRenderer: createSimpleRendererClass({
    render: vi.fn()
  })
}))

vi.mock('../../src/rendering/movementTargetRenderer.js', () => ({
  MovementTargetRenderer: createSimpleRendererClass({
    render: vi.fn()
  })
}))

vi.mock('../../src/rendering/retreatTargetRenderer.js', () => ({
  RetreatTargetRenderer: createSimpleRendererClass({
    renderRetreatTargets: vi.fn()
  })
}))

vi.mock('../../src/rendering/guardRenderer.js', () => ({
  GuardRenderer: createSimpleRendererClass({
    render: vi.fn()
  })
}))

vi.mock('../../src/rendering/pathPlanningRenderer.js', () => ({
  PathPlanningRenderer: createSimpleRendererClass({
    render: vi.fn()
  })
}))

vi.mock('../../src/rendering/uiRenderer.js', () => ({
  UIRenderer: createSimpleRendererClass({
    renderGameOver: vi.fn(() => false),
    render: vi.fn()
  })
}))

vi.mock('../../src/rendering/minimapRenderer.js', () => ({
  MinimapRenderer: createSimpleRendererClass({
    render: vi.fn()
  })
}))

vi.mock('../../src/ui/harvesterHUD.js', () => ({
  HarvesterHUD: createSimpleRendererClass({
    render: vi.fn()
  })
}))

vi.mock('../../src/rendering/dangerZoneRenderer.js', () => ({
  DangerZoneRenderer: createSimpleRendererClass({
    render: vi.fn()
  })
}))

vi.mock('../../src/rendering/wreckRenderer.js', () => ({
  WreckRenderer: createSimpleRendererClass({
    render: vi.fn()
  })
}))

vi.mock('../../src/rendering/mineRenderer.js', () => ({
  renderMineIndicators: vi.fn(),
  renderMineDeploymentPreview: vi.fn(),
  renderSweepAreaPreview: vi.fn(),
  renderFreeformSweepPreview: vi.fn()
}))

vi.mock('../../src/rendering/webglRenderer.js', () => ({
  GameWebGLRenderer: class {
    constructor() {
      this.rendersWaterSot = true
      this.render = vi.fn(() => true)
      this.setContext = vi.fn()
      this.setMapRenderer = vi.fn()
    }
  }
}))

vi.mock('../../src/rendering/tankImageRenderer.js', () => ({ preloadTankImages: vi.fn() }))
vi.mock('../../src/rendering/harvesterImageRenderer.js', () => ({ preloadHarvesterImage: vi.fn() }))
vi.mock('../../src/rendering/rocketTankImageRenderer.js', () => ({ preloadRocketTankImage: vi.fn() }))
vi.mock('../../src/rendering/ambulanceImageRenderer.js', () => ({ preloadAmbulanceImage: vi.fn() }))
vi.mock('../../src/rendering/tankerTruckImageRenderer.js', () => ({ preloadTankerTruckImage: vi.fn() }))
vi.mock('../../src/rendering/recoveryTankImageRenderer.js', () => ({ preloadRecoveryTankImage: vi.fn() }))
vi.mock('../../src/rendering/ammunitionTruckImageRenderer.js', () => ({ preloadAmmunitionTruckImage: vi.fn() }))
vi.mock('../../src/rendering/mineLayerImageRenderer.js', () => ({ preloadMineLayerImage: vi.fn() }))
vi.mock('../../src/rendering/mineSweeperImageRenderer.js', () => ({ preloadMineSweeperImage: vi.fn() }))
vi.mock('../../src/rendering/howitzerImageRenderer.js', () => ({ preloadHowitzerImage: vi.fn() }))
vi.mock('../../src/inputHandler.js', () => ({ selectedUnits: [] }))

describe('Renderer airborne layering', () => {
  let Renderer

  beforeEach(async() => {
    vi.clearAllMocks()
    ;({ Renderer } = await import('../../src/rendering/renderer.js'))
  })

  it('partitions airborne units into the top render layer', () => {
    const renderer = new Renderer()
    const groundedTank = { id: 'ground-1', type: 'tank_v1', x: 0, y: 0, flightState: 'grounded' }
    const airborneApache = { id: 'air-1', type: 'apache', x: 0, y: 0, flightState: 'airborne', isAirUnit: true }
    const parkedApache = { id: 'air-2', type: 'apache', x: 0, y: 0, flightState: 'grounded', isAirUnit: true }

    const result = renderer.partitionUnitsByRenderLayer([groundedTank, airborneApache, parkedApache])

    expect(result.groundedUnits.map(unit => unit.id)).toEqual(['ground-1', 'air-2'])
    expect(result.airborneUnits.map(unit => unit.id)).toEqual(['air-1'])
  })

  it('renders airborne units after grounded units and building overlays', () => {
    const renderer = new Renderer()
    const callOrder = []
    const groundedTank = { id: 'ground-1', type: 'tank_v1', x: 0, y: 0, flightState: 'grounded' }
    const airborneApache = { id: 'air-1', type: 'apache', x: 64, y: 64, flightState: 'airborne', isAirUnit: true }
    const gameCtx = {
      canvas: { width: 800, height: 600 },
      globalAlpha: 1,
      save: vi.fn(() => callOrder.push('ctx.save')),
      restore: vi.fn(() => callOrder.push('ctx.restore')),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 10 }))
    }

    renderer.mapRenderer.render.mockImplementation(() => callOrder.push('map'))
    renderer.buildingRenderer.renderBases.mockImplementation((_ctx, entities) => {
      callOrder.push(`building-bases:${entities.length}`)
    })
    renderer.wreckRenderer.render.mockImplementation(() => callOrder.push('wrecks'))
    renderer.unitRenderer.renderBases.mockImplementation((_ctx, entities) => {
      callOrder.push(`unit-bases:${entities.map(entity => entity.id).join(',') || 'none'}`)
    })
    renderer.effectsRenderer.render.mockImplementation(() => callOrder.push('effects'))
    renderer.harvesterHUD.render.mockImplementation(() => callOrder.push('harvester-hud'))
    renderer.buildingRenderer.renderOverlays.mockImplementation((_ctx, entities) => {
      callOrder.push(`building-overlays:${entities.length}`)
    })
    renderer.unitRenderer.renderOverlays.mockImplementation((_ctx, entities) => {
      callOrder.push(`unit-overlays:${entities.map(entity => entity.id).join(',') || 'none'}`)
    })
    renderer.buildingRenderer.renderHudHoverTooltip.mockImplementation(() => callOrder.push('building-tooltip'))
    renderer.uiRenderer.render.mockImplementation(() => callOrder.push('ui'))

    renderer.renderGame(
      gameCtx,
      { width: 800, height: 600 },
      [[{ type: 'land' }]],
      [{ id: 'factory-1', type: 'constructionYard', x: 0, y: 0, width: 2, height: 2 }],
      [groundedTank, airborneApache],
      [],
      [{ id: 'building-1', type: 'powerPlant', x: 2, y: 2, width: 2, height: 2 }],
      { x: 0, y: 0 },
      false,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { entityImageOpacityLevel: 0, unitWrecks: [] }
    )

    expect(callOrder).toContain('unit-bases:ground-1')
    expect(callOrder).toContain('unit-bases:air-1')
    expect(callOrder).toContain('unit-overlays:ground-1')
    expect(callOrder).toContain('unit-overlays:air-1')

    expect(callOrder.indexOf('unit-bases:ground-1')).toBeLessThan(callOrder.indexOf('building-overlays:1'))
    expect(callOrder.indexOf('building-overlays:1')).toBeLessThan(callOrder.indexOf('unit-bases:air-1'))
    expect(callOrder.indexOf('unit-overlays:ground-1')).toBeLessThan(callOrder.indexOf('unit-bases:air-1'))
    expect(callOrder.indexOf('unit-bases:air-1')).toBeLessThan(callOrder.indexOf('unit-overlays:air-1'))
  })

  it('keeps GPU procedural water active in water-only mode when custom sheets have no water tags', () => {
    const renderer = new Renderer()
    const gameCtx = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      globalAlpha: 1,
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 10 }))
    }
    const gpuContext = {
      viewport: vi.fn(),
      clearColor: vi.fn(),
      clear: vi.fn(),
      COLOR_BUFFER_BIT: 1
    }
    const gameCanvas = { width: 800, height: 600 }
    const gpuCanvas = { width: 800, height: 600 }
    const mapGrid = [[{ type: 'water' }, { type: 'land' }]]
    const gameState = { useIntegratedSpriteSheetMode: true, unitWrecks: [] }

    renderer.textureManager.integratedTagBuckets = {}
    renderer.mapRenderer.render.mockClear()

    renderer.renderGame(
      gameCtx,
      gameCanvas,
      mapGrid,
      [],
      [],
      [],
      [],
      { x: 0, y: 0 },
      false,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      gameState,
      gpuContext,
      gpuCanvas
    )

    expect(renderer.gpuRenderer.render).toHaveBeenCalledWith(mapGrid, { x: 0, y: 0 }, gpuCanvas, { waterOnly: true })
    expect(renderer.mapRenderer.render).toHaveBeenCalledWith(
      gameCtx,
      mapGrid,
      { x: 0, y: 0 },
      gameCanvas,
      expect.objectContaining({ useIntegratedSpriteSheetMode: true, unitWrecks: [] }),
      null,
      { skipBaseLayer: false, skipWaterSot: true, skipWaterBase: true, gpuRenderedResources: false, separateWaterLayer: false }
    )
  })

  it('uses GPU water-only mode when default street sheet terrain must be composited on CPU', () => {
    const renderer = new Renderer()
    const gameCtx = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      globalAlpha: 1,
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 10 }))
    }
    const gpuContext = {
      viewport: vi.fn(),
      clearColor: vi.fn(),
      clear: vi.fn(),
      COLOR_BUFFER_BIT: 1
    }
    const gameCanvas = { width: 800, height: 600 }
    const gpuCanvas = { width: 800, height: 600 }
    const mapGrid = [[{ type: 'street' }, { type: 'water' }]]
    const gameState = { useIntegratedSpriteSheetMode: false, unitWrecks: [] }

    renderer.textureManager.defaultStreetTagBuckets = {
      street: [{ rect: { x: 0, y: 0, width: 64, height: 64 } }]
    }
    renderer.mapRenderer.render.mockClear()

    renderer.renderGame(
      gameCtx,
      gameCanvas,
      mapGrid,
      [],
      [],
      [],
      [],
      { x: 0, y: 0 },
      false,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      gameState,
      gpuContext,
      gpuCanvas
    )

    expect(renderer.gpuRenderer.render).toHaveBeenCalledWith(mapGrid, { x: 0, y: 0 }, gpuCanvas, { waterOnly: true })
    expect(renderer.mapRenderer.render).toHaveBeenCalledWith(
      gameCtx,
      mapGrid,
      { x: 0, y: 0 },
      gameCanvas,
      expect.objectContaining({ useIntegratedSpriteSheetMode: false, unitWrecks: [] }),
      null,
      { skipBaseLayer: false, skipWaterSot: true, skipWaterBase: true, gpuRenderedResources: false, separateWaterLayer: false }
    )
  })

  it('does not use legacy GPU terrain when integrated custom water tiles are available', () => {
    const renderer = new Renderer()
    const gameCtx = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      globalAlpha: 1,
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 10 }))
    }
    const gpuContext = {
      viewport: vi.fn(),
      clearColor: vi.fn(),
      clear: vi.fn(),
      COLOR_BUFFER_BIT: 1
    }
    const gameCanvas = { width: 800, height: 600 }
    const gpuCanvas = { width: 800, height: 600 }
    const mapGrid = [[{ type: 'water' }, { type: 'land' }]]
    const gameState = { useIntegratedSpriteSheetMode: true, unitWrecks: [] }

    renderer.textureManager.integratedTagBuckets = { water: [{ rect: { x: 0, y: 0, width: 64, height: 64 } }] }
    renderer.mapRenderer.render.mockClear()

    renderer.renderGame(
      gameCtx,
      gameCanvas,
      mapGrid,
      [],
      [],
      [],
      [],
      { x: 0, y: 0 },
      false,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      gameState,
      gpuContext,
      gpuCanvas
    )

    expect(renderer.gpuRenderer).toBeNull()
    expect(renderer.mapRenderer.render).toHaveBeenCalledWith(
      gameCtx,
      mapGrid,
      { x: 0, y: 0 },
      gameCanvas,
      expect.objectContaining({ useIntegratedSpriteSheetMode: true, unitWrecks: [] }),
      null,
      { skipBaseLayer: false, skipWaterSot: false, skipWaterBase: false, gpuRenderedResources: false, separateWaterLayer: false }
    )
    expect(gpuContext.clear).toHaveBeenCalledWith(gpuContext.COLOR_BUFFER_BIT)
  })
})
