import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadGameFromStateMock = vi.hoisted(() => vi.fn())
const showNotificationMock = vi.hoisted(() => vi.fn())
const terminateAllSoundsMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    replayMode: false,
    replay: null,
    gamePaused: false
  }
}))

vi.mock('../../src/config.js', () => ({ TILE_SIZE: 32 }))
vi.mock('../../src/saveGame.js', () => ({
  saveGame: vi.fn(),
  loadGameFromState: loadGameFromStateMock,
  updateSaveGamesList: vi.fn()
}))
vi.mock('../../src/ui/notifications.js', () => ({ showNotification: showNotificationMock }))
vi.mock('../../src/ai-api/applier.js', () => ({ applyGameTickOutput: vi.fn() }))
vi.mock('../../src/productionQueue.js', () => ({ productionQueue: [] }))
vi.mock('../../src/input/cheatSystem.js', () => ({ CheatSystem: class {} }))
vi.mock('../../src/input/unitCommands.js', () => ({ UnitCommandsHandler: class {} }))
vi.mock('../../src/buildings.js', () => ({
  createBuilding: vi.fn(),
  canPlaceBuilding: vi.fn(() => true),
  placeBuilding: vi.fn(),
  updatePowerSupply: vi.fn()
}))
vi.mock('../../src/units.js', () => ({ spawnUnit: vi.fn() }))
vi.mock('../../src/utils.js', () => ({ getBuildingIdentifier: vi.fn() }))
vi.mock('../../src/game/sellUnitAtWorkshop.js', () => ({ sellUnitAtWorkshop: vi.fn() }))
vi.mock('../../src/game/unitWreckManager.js', () => ({ getWreckById: vi.fn() }))
vi.mock('../../src/behaviours/retreat.js', () => ({ initiateRetreat: vi.fn() }))
vi.mock('../../src/game/dangerZoneMap.js', () => ({ updateDangerZoneMaps: vi.fn() }))
vi.mock('../../src/ai/enemySpawner.js', () => ({ spawnEnemyUnit: vi.fn() }))
vi.mock('../../src/network/deterministicRandom.js', () => ({ initializeSessionRNG: vi.fn() }))
vi.mock('../../src/sound.js', () => ({ terminateAllSounds: terminateAllSoundsMock }))

import { gameState } from '../../src/gameState.js'
import { loadReplay, updateReplayPlayback } from '../../src/replaySystem.js'

describe('replaySystem.loadReplay', () => {
  beforeEach(() => {
    loadGameFromStateMock.mockReset()
    showNotificationMock.mockReset()
    terminateAllSoundsMock.mockReset()
    localStorage.clear()
  })

  it('[U03755] terminates previous session sounds before loading replay baseline state', () => {
    localStorage.setItem(
      'rts_replay_test',
      JSON.stringify({
        label: 'Test Replay',
        baselineState: JSON.stringify({ units: [] }),
        commands: []
      })
    )

    loadReplay('rts_replay_test')

    expect(terminateAllSoundsMock).toHaveBeenCalledTimes(1)
    expect(loadGameFromStateMock).toHaveBeenCalledTimes(1)
    expect(terminateAllSoundsMock.mock.invocationCallOrder[0]).toBeLessThan(
      loadGameFromStateMock.mock.invocationCallOrder[0]
    )
  })
})

it('[U07379] waits for the first planned route leg before replaying queued legs', () => {
  const unit = { id: 'route-unit', owner: 'player1', health: 100, x: 32, y: 32, commandQueue: [] }
  const previousHandler = window.unitCommandsHandler
  window.unitCommandsHandler = { handleMovementCommand: vi.fn() }
  Object.assign(gameState, { simulationTime: 100, gamePaused: false, replayMode: true, units: [unit], mapGrid: [], replay: {
    playbackActive: true, playbackStartedAt: 0, playbackCursor: 0,
    playbackCommands: [
      { at: 0, command: { type: 'unit_command', command: 'move', owner: 'player1', unitIds: [unit.id], targetPos: { space: 'world', x: 100, y: 100 }, plannedRouteStart: true } },
      { at: 0, command: { type: 'unit_command', command: 'move', owner: 'player1', unitIds: [unit.id], targetPos: { space: 'world', x: 200, y: 100 }, queueAppend: true } }
    ]
  } })
  try {
    updateReplayPlayback()
    expect(window.unitCommandsHandler.handleMovementCommand).toHaveBeenCalledOnce()
    expect(unit.currentCommand).toEqual({ type: 'move', x: 100, y: 100 })
    expect(unit.commandQueue).toEqual([{ type: 'move', x: 200, y: 100 }])
  } finally { window.unitCommandsHandler = previousHandler }
})
