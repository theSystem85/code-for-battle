import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSetIntegratedSpriteSheetConfig = vi.fn(async() => {})
const mockInvalidateAllChunks = vi.fn()
const mockComputeSotMask = vi.fn()
const mockInitSpriteSheetEditor = vi.fn(async(options = {}) => {
  globalThis.__capturedSseOptions = options
  return { refreshRuntimeSheetData: vi.fn() }
})

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    multiplayerSession: null,
    useIntegratedSpriteSheetMode: true,
    activeSpriteSheetPath: null,
    activeSpriteSheetMetadata: null,
    activeSpriteSheetSelections: [],
    availableStaticSpriteSheets: [],
    activeSpriteSheetBiomeTag: 'grass',
    units: [],
    mapGrid: []
  }
}))

vi.mock('../../src/rendering.js', () => ({
  getTextureManager: () => ({
    setIntegratedSpriteSheetConfig: mockSetIntegratedSpriteSheetConfig
  }),
  getMapRenderer: () => ({
    invalidateAllChunks: mockInvalidateAllChunks,
    computeSOTMask: mockComputeSotMask
  })
}))

vi.mock('../../src/units.js', () => ({
  initializeOccupancyMap: vi.fn(() => [])
}))

vi.mock('../../src/network/multiplayerSessionEvents.js', () => ({
  observeMultiplayerSession: vi.fn()
}))

vi.mock('../../src/network/multiplayerStore.js', () => ({
  listPartyStates: vi.fn(() => []),
  observePartyOwnershipChange: vi.fn()
}))

vi.mock('../../src/mapEditor.js', () => ({
  activateMapEditMode: vi.fn(),
  deactivateMapEditMode: vi.fn(),
  describeBrush: vi.fn(() => 'Brush'),
  getMapEditorState: vi.fn(() => ({
    active: false,
    randomMode: false,
    tilePalette: [{ id: 'grass' }],
    currentTileIndex: 0,
    pipetteEntry: null
  })),
  handleWheel: vi.fn(),
  isMapEditorLocked: vi.fn(() => false),
  lockMapEditor: vi.fn(),
  unlockMapEditor: vi.fn(),
  resetBrush: vi.fn(),
  setBrushFromProduction: vi.fn(),
  setTileBrushById: vi.fn(),
  toggleRandomMode: vi.fn()
}))

vi.mock('../../src/ui/spriteSheetEditor.js', () => ({
  initSpriteSheetEditor: mockInitSpriteSheetEditor
}))

describe('mapEditorControls integrated sheet selection list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    globalThis.__capturedSseOptions = null
    localStorage.clear()
    document.body.innerHTML = `
      <input id="integratedSpriteSheetModeCheckbox" type="checkbox" checked />
      <select id="integratedSpriteSheetBiomeSelect">
        <option value="grass" selected>grass</option>
      </select>
      <div id="integratedSpriteSheetSelectionContainer">
        <div id="integratedSpriteSheetSelectionList"></div>
      </div>
      <button id="pauseBtn"><span class="play-pause-icon"></span></button>
    `

    vi.stubGlobal('fetch', vi.fn(async(url) => {
      if (url === 'images/map/sprite_sheets/index.json') {
        return {
          ok: true,
          json: async() => ({
            sheets: ['images/map/sprite_sheets/default.webp', 'images/map/sprite_sheets/dtv3_city.webp']
          })
        }
      }
      return {
        ok: false,
        json: async() => ({})
      }
    }))
  })

  it('regenerates changed topology once and preserves topology during restore', async() => {
    const { gameState } = await import('../../src/gameState.js')
    const { applyIntegratedSpriteSheetRuntime, setTopologyRegenerator } = await import('../../src/ui/mapEditorControls.js')
    const regenerate = vi.fn()
    setTopologyRegenerator(regenerate)
    gameState.useIntegratedSpriteSheetMode = false
    gameState.mapTopologyFingerprint = 'previous-custom-topology'
    gameState.mapSeed = '688'
    await applyIntegratedSpriteSheetRuntime()
    expect(regenerate).toHaveBeenCalledTimes(1)
    expect(gameState.mapTopologyFingerprint).toBe('default')
    expect(gameState.mapSeed).toBe('688')
    await applyIntegratedSpriteSheetRuntime()
    expect(regenerate).toHaveBeenCalledTimes(1)
    gameState.mapTopologyFingerprint = 'saved-topology'
    await applyIntegratedSpriteSheetRuntime(null, { preserveTopology: true })
    expect(gameState.mapTopologyFingerprint).toBe('saved-topology')
    expect(regenerate).toHaveBeenCalledTimes(1)
    setTopologyRegenerator(null)
    gameState.useIntegratedSpriteSheetMode = true
  })

  it('awaits persisted startup sheets without regenerating or applying the editor selection', async() => {
    const { gameState } = await import('../../src/gameState.js')
    const { initMapEditorControls, setTopologyRegenerator } = await import('../../src/ui/mapEditorControls.js')
    const regenerate = vi.fn()
    setTopologyRegenerator(regenerate)
    gameState.mapTopologyFingerprint = null
    localStorage.setItem('rts-integrated-spritesheet-mode', 'true')
    localStorage.setItem('rts-integrated-spritesheet-selected-sheets', JSON.stringify([
      'images/map/sprite_sheets/dtv3_city.webp', 'images/map/sprite_sheets/missing.webp'
    ]))
    await initMapEditorControls()
    expect(mockSetIntegratedSpriteSheetConfig).toHaveBeenCalledTimes(1)
    expect(gameState.activeSpriteSheetSelections).toEqual(['images/map/sprite_sheets/dtv3_city.webp'])
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('missing'), expect.anything())
    expect(gameState.mapTopologyFingerprint).toBe('default')
    expect(regenerate).not.toHaveBeenCalled()
    setTopologyRegenerator(null)
  })

  it('enables custom sprite sheets by default and respects a stored opt-out', async() => {
    const { gameState } = await import('../../src/gameState.js')
    const { initMapEditorControls } = await import('../../src/ui/mapEditorControls.js')
    gameState.useIntegratedSpriteSheetMode = false
    await initMapEditorControls()
    expect(gameState.useIntegratedSpriteSheetMode).toBe(true)
    localStorage.setItem('rts-integrated-spritesheet-mode', 'false')
    await initMapEditorControls()
    expect(gameState.useIntegratedSpriteSheetMode).toBe(false)
    gameState.useIntegratedSpriteSheetMode = true
  })

  it('filters unknown runtime selections before fetching sheet metadata', async() => {
    const { gameState } = await import('../../src/gameState.js')
    const { applyIntegratedSpriteSheetRuntime } = await import('../../src/ui/mapEditorControls.js')
    gameState.availableStaticSpriteSheets = ['images/map/sprite_sheets/default.webp']
    gameState.activeSpriteSheetSelections = ['images/map/sprite_sheets/missing.webp']
    await applyIntegratedSpriteSheetRuntime()
    expect(fetch).not.toHaveBeenCalled()
    expect(mockSetIntegratedSpriteSheetConfig.mock.calls.at(-1)[0].sheets).toEqual([])
  })

  it('adds applied uploaded sheets to the checkbox list and runtime selected sheets', async() => {
    const { initMapEditorControls } = await import('../../src/ui/mapEditorControls.js')
    initMapEditorControls()

    await Promise.resolve()
    await Promise.resolve()

    const uploadedMetadata = {
      sheetPath: 'blob:uploaded-sheet',
      displayName: 'uploaded_terrain_sheet.webp',
      tileSize: 64,
      rowHeight: 64,
      borderWidth: 0,
      tags: ['grass'],
      tiles: {
        '0,0': {
          tags: ['grass', 'passable'],
          rect: { x: 0, y: 0, width: 64, height: 64 }
        }
      }
    }

    await globalThis.__capturedSseOptions.onApply(uploadedMetadata)
    await Promise.resolve()

    const uploadedCheckbox = document.querySelector('input[data-sheet-path="blob:uploaded-sheet"]')
    expect(uploadedCheckbox).not.toBeNull()
    expect(uploadedCheckbox.checked).toBe(true)
    expect(uploadedCheckbox.parentElement?.textContent).toContain('uploaded_terrain_sheet.webp')
    expect(uploadedCheckbox.parentElement?.textContent).not.toContain('blob:uploaded-sheet')
    expect(mockInvalidateAllChunks).toHaveBeenCalled()
    expect(mockComputeSotMask).toHaveBeenCalled()

    const latestConfig = mockSetIntegratedSpriteSheetConfig.mock.calls.at(-1)?.[0]
    expect(Array.isArray(latestConfig?.sheets)).toBe(true)
    expect(latestConfig.sheets.some((entry) => entry.sheetPath === 'blob:uploaded-sheet')).toBe(true)
  })
})
