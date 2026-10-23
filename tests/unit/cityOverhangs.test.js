import { describe, it, expect, vi, afterEach } from 'vitest'
import { cityFootprintGroup, prepareCityVisual, renderCityOverhangs } from '../../src/rendering/cityOverhangs.js'
import { prepareCityBuildings, getCityBuildings, getAttackableCityAtWorld, applyCityDamage, isUnitUnderCityOverhang } from '../../src/game/cityBuildings.js'
import { TextureManager } from '../../src/rendering/textureManager.js'
import { UnitRenderer } from '../../src/rendering/unitRenderer.js'
import { buildOccupancyMap, findPath } from '../../src/units.js'
import { gameState } from '../../src/gameState.js'

vi.mock('../../src/main.js', () => ({ units: [] }))
vi.mock('../../src/rendering.js', () => ({ getMapRenderer: vi.fn(), getTextureManager: vi.fn(), notifyTileMutation: vi.fn(), notifyTerrainMutation: vi.fn(), recomputeSOTMask: vi.fn(), publishPreparedRuntimeMap: vi.fn(), prepareRuntimeSprites: vi.fn(), renderGame: vi.fn(), preloadTextures: vi.fn() }))
vi.mock('../../src/sound.js', () => ({ playPositionalSound: vi.fn(), playSound: vi.fn() }))
vi.mock('../../src/game/spriteSheetEffects.js', () => ({ spawnDestructionExplosion: vi.fn() }))
const previousMap = gameState.mapGrid
afterEach(() => { gameState.mapGrid = previousMap })

function fixture() {
  const image = {}, base = ['sand', 'decorative', 'city', 'skyscraper', 'group_1']
  const source = { width: 3, height: 5, groupLabel: 'group_1', tagSet: new Set([...base, 'impassable', 'passable', 'overhang']), tilesByOffset: {} }
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) source.tilesByOffset[`${x},${y}`] = {
    image, tags: [...base, ...(y < 2 ? ['passable', 'overhang'] : ['impassable'])],
    rect: { x: x * 64, y: y * 64, width: 64, height: 64 }, blendMode: 'alpha'
  }
  const group = cityFootprintGroup(source)
  const map = Array.from({ length: 24 }, () => Array.from({ length: 24 }, () => ({ type: 'land', biome: 'sand' })))
  const placement = { group, anchorX: 8, anchorY: 8, biome: 'sand' }
  const layout = { width: 24, height: 24, placements: [placement], cityStreets: [], cells: new Array(24 * 24).fill(null) }
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) layout.cells[(8 + y) * 24 + 8 + x] = { ...placement, offsetX: x, offsetY: y }
  prepareCityBuildings(map, layout)
  gameState.mapGrid = map
  return { source, group, map, layout, building: getCityBuildings(map)[0] }
}

describe('city visual height and ground footprints', () => {
  it('[U05446] blocks only the ground rectangle, leaves the upper route traversable and keeps shared building HP', () => {
    const { source, group, map, layout, building } = fixture()
    expect([group.width, group.height]).toEqual([3, 3])
    expect(group.visualTilesByOffset).toBe(source.tilesByOffset)
    expect(group.cityVisual.offsetY).toBe(-64)
    expect(group.tagSet.has('passable')).toBe(false)
    const manager = new TextureManager()
    manager.integratedSpriteSheetMode = true
    manager.integratedSpriteSheetImage = {}
    manager.integratedSpriteSheetMetadata = {}
    vi.spyOn(manager, 'getDecorationLayout').mockReturnValue(layout)
    const occupancy = buildOccupancyMap([], map, manager)
    for (let y = 8; y < 11; y++) for (let x = 8; x < 11; x++) {
      expect(occupancy[y][x]).toBe(1)
      expect(layout.cells[y * 24 + x].cityBuilding).toBe(building)
    }
    for (let x = 8; x < 11; x++) expect(occupancy[7][x]).toBe(0)
    const path = findPath({ x: 6, y: 7 }, { x: 12, y: 7 }, map, occupancy)
    expect(path).toEqual([{ x: 6, y: 7 }, { x: 12, y: 7 }])
    expect(getAttackableCityAtWorld(map, 9 * 32 + 16, 7 * 32 + 16)).toBeNull()
    expect(getAttackableCityAtWorld(map, 9 * 32 + 16, 8 * 32 + 16)).toBe(building)
  })

  it('[U05447] prepares final-density imagery once and culls or hides destroyed and undiscovered buildings', () => {
    const { group, building, map } = fixture()
    const drawing = { drawImage: vi.fn() }, canvas = { getContext: () => drawing }
    group.cityVisual.sprite = prepareCityVisual(group.cityVisual, 2, () => canvas)
    expect([canvas.width, canvas.height]).toEqual([192, 320])
    expect(drawing.drawImage).toHaveBeenCalledTimes(15)
    const ctx = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn() }
    renderCityOverhangs(ctx, map, { x: 0, y: 0 }, 800, 600, {})
    expect(ctx.drawImage).toHaveBeenCalledOnce()
    expect(ctx.translate).toHaveBeenCalledWith(256, 192)
    ctx.drawImage.mockClear()
    renderCityOverhangs(ctx, map, { x: 2000, y: 0 }, 800, 600, {})
    renderCityOverhangs(ctx, map, { x: 0, y: 0 }, 800, 600, { shadowOfWarEnabled: true, visibilityMap: Array.from({ length: 24 }, () => []) })
    expect(ctx.drawImage).not.toHaveBeenCalled()
    expect(isUnitUnderCityOverhang(map, { x: 9 * 32, y: 7 * 32 })).toBe(true)
    applyCityDamage(building, building.maxHealth, map, { occupancyMap: [] })
    expect(isUnitUnderCityOverhang(map, { x: 9 * 32, y: 7 * 32 })).toBe(false)
    renderCityOverhangs(ctx, map, { x: 0, y: 0 }, 800, 600, {})
    expect(ctx.drawImage).not.toHaveBeenCalled()
    expect(JSON.stringify(building)).not.toContain('sprite')
  })

  it('[U05448] forces a visible health HUD and redraws selected unit markers above overhead artwork', () => {
    fixture()
    const renderer = new UnitRenderer()
    for (const name of ['renderHealthBar', 'renderSelection', 'renderGasBar', 'renderAmmunitionBar', 'renderLevelStars', 'renderHarvesterProgress', 'renderQueueNumber', 'renderGroupNumber', 'renderCrewStatus', 'renderPolicyActiveIcon', 'renderAttackTargetIndicator', 'renderUtilityServiceIndicator', 'renderWorkshopRepairIndicator', 'renderRecoveryProgressBar']) vi.spyOn(renderer, name).mockImplementation(() => {})
    const unit = { x: 9 * 32, y: 7 * 32, selected: true, health: 100, maxHealth: 100, type: 'tank' }
    renderer.renderUnitOverlay({}, unit, { x: 0, y: 0 }, 800, 600, true)
    expect(renderer.renderHealthBar).toHaveBeenCalledWith({}, unit, { x: 0, y: 0 }, true)
    expect(renderer.renderSelection).toHaveBeenCalledWith({}, unit, 304, 240)
    unit.selected = false
    renderer.renderUnitOverlay({}, unit, { x: 0, y: 0 }, 800, 600, true)
    expect(renderer.renderHealthBar).toHaveBeenLastCalledWith({}, unit, { x: 0, y: 0 }, true)
  })

  it('[U05449] rejects ambiguous non-rectangular collision tags instead of making hidden blocking tiles', () => {
    const { source } = fixture()
    source.tilesByOffset['1,3'].tags = ['sand', 'decorative', 'city', 'passable', 'overhang']
    expect(() => cityFootprintGroup(source)).toThrow(/rectangles/)
  })
})
