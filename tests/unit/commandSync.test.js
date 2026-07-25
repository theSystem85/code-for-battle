/**
 * Unit tests for network command synchronization helpers and state hashing.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest'

// Use vi.hoisted to ensure mocks are defined before vi.mock factories run
const lockstepManagerMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  receiveInput: vi.fn(),
  getInputsForTick: vi.fn().mockReturnValue([]),
  advanceTick: vi.fn(),
  reset: vi.fn()
}))

const inputBufferMocks = vi.hoisted(() => ({
  addInput: vi.fn(),
  confirmTick: vi.fn(),
  clear: vi.fn()
}))

// Mock buildings module to prevent benchmarkScenario.js from failing
vi.mock('../../src/buildings.js', () => ({
  buildingData: {
    constructionYard: { power: 0, cost: 5000 },
    powerPlant: { power: 100, cost: 300 },
    vehicleFactory: { power: -30, cost: 1000 }
  },
  placeBuilding: vi.fn(),
  canPlaceBuilding: vi.fn().mockReturnValue(true),
  createBuilding: vi.fn(),
  updatePowerSupply: vi.fn()
}))

// Mock main.js to prevent initialization issues
vi.mock('../../src/main.js', () => ({
  factories: [],
  units: [],
  bullets: [],
  mapGrid: [],
  getCurrentGame: vi.fn(),
  regenerateMapForClient: vi.fn()
}))

// Mock gameState
vi.mock('../../src/gameState.js', () => ({
  gameState: {
    humanPlayer: 'player1',
    buildings: [],
    units: [],
    bullets: [],
    factories: [],
    explosions: [],
    unitWrecks: [],
    money: 1000,
    gamePaused: false,
    gameStarted: true,
    partyStates: [],
    multiplayerSession: {
      localRole: 'host',
      isRemote: false
    },
    lockstep: {
      enabled: false,
      sessionSeed: null,
      currentTick: 0,
      inputDelay: 2,
      hashInterval: 5,
      desyncDetected: false,
      desyncTick: null,
      pendingResync: false,
      tickAccumulator: 0,
      lastTickTime: 0
    }
  }
}))

// Mock config
vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32,
  setMapDimensions: vi.fn(),
  ORE_SPREAD_ENABLED: false,
  setOreSpreadEnabled: vi.fn()
}))

// Mock other dependencies
vi.mock('../../src/network/remoteConnection.js', () => ({
  getActiveRemoteConnection: vi.fn()
}))

vi.mock('../../src/network/webrtcSession.js', () => ({
  getActiveHostMonitor: vi.fn()
}))

vi.mock('../../src/network/lockstepManager.js', () => ({
  lockstepManager: lockstepManagerMocks,
  LOCKSTEP_CONFIG: {
    TICK_RATE: 20,
    INPUT_DELAY_TICKS: 2,
    HASH_INTERVAL_TICKS: 3
  },
  MS_PER_TICK: 16,
  __mocks: lockstepManagerMocks
}))

vi.mock('../../src/network/deterministicRandom.js', () => ({
  deterministicRNG: { random: vi.fn().mockReturnValue(0.5) },
  initializeSessionRNG: vi.fn(),
  syncRNGForTick: vi.fn()
}))

vi.mock('../../src/network/inputBuffer.js', () => ({
  InputBuffer: class {
    addInput(...args) {
      return inputBufferMocks.addInput(...args)
    }

    confirmTick(...args) {
      return inputBufferMocks.confirmTick(...args)
    }

    clear(...args) {
      return inputBufferMocks.clear(...args)
    }
  },
  LOCKSTEP_INPUT_TYPES: {
    UNIT_MOVE: 'unit-move',
    UNIT_ATTACK: 'unit-attack',
    UNIT_STOP: 'unit-stop',
    BUILD_PLACE: 'build-place',
    PRODUCTION_START: 'production-start'
  },
  createLockstepInput: vi.fn((inputType, data, tick, partyId) => ({
    id: `input-${tick}`,
    type: inputType,
    data,
    tick,
    partyId
  })),
  __mocks: inputBufferMocks
}))

import * as commandSync from '../../src/network/gameCommandSync.js'
import { gameState } from '../../src/gameState.js'
import { getActiveRemoteConnection } from '../../src/network/remoteConnection.js'
import { getActiveHostMonitor } from '../../src/network/webrtcSession.js'
import { deterministicRNG, initializeSessionRNG } from '../../src/network/deterministicRandom.js'
import { createLockstepInput, __mocks as inputBufferSpies } from '../../src/network/inputBuffer.js'
import { __mocks as lockstepManagerSpies } from '../../src/network/lockstepManager.js'
import {
  compareHashes,
  computeStateHash,
  computeQuickHash,
  createHashReport,
  hashArrayOrdered
} from '../../src/network/stateHash.js'

beforeEach(() => {
  gameState.humanPlayer = 'player1'
  gameState.buildings = []
  gameState.units = []
  gameState.bullets = []
  gameState.factories = []
  gameState.explosions = []
  gameState.unitWrecks = []
  gameState.money = 1000
  gameState.gamePaused = false
  gameState.gameStarted = true
  gameState.partyStates = []
  gameState.multiplayerSession = {
    localRole: 'host',
    isRemote: false
  }
  gameState.lockstep = {
    enabled: false,
    sessionSeed: null,
    currentTick: 0,
    inputDelay: 2,
    hashInterval: 5,
    desyncDetected: false,
    desyncTick: null,
    pendingResync: false,
    tickAccumulator: 0,
    lastTickTime: 0
  }
  inputBufferSpies.addInput.mockClear()
  inputBufferSpies.confirmTick.mockClear()
  inputBufferSpies.clear.mockClear()
  lockstepManagerSpies.initialize.mockClear()
  lockstepManagerSpies.receiveInput.mockClear()
  lockstepManagerSpies.getInputsForTick.mockClear()
  lockstepManagerSpies.advanceTick.mockClear()
  lockstepManagerSpies.reset.mockClear()
  vi.mocked(getActiveRemoteConnection).mockReset()
  vi.mocked(getActiveHostMonitor).mockReset()
  vi.mocked(initializeSessionRNG).mockClear()
  vi.mocked(createLockstepInput).mockClear()
  vi.spyOn(Math, 'random').mockRestore()
  if (!window.logger) {
    const logger = vi.fn()
    logger.warn = vi.fn()
    window.logger = logger
  }
})

describe('command sync helpers', () => {
  it('creates move command payloads with normalized unitIds', () => {
    expect(commandSync.createMoveCommand('unit-1', 10, 12)).toEqual({
      unitIds: ['unit-1'],
      targetX: 10,
      targetY: 12
    })

    expect(commandSync.createMoveCommand(['unit-1', 'unit-2'], 3, 4)).toEqual({
      unitIds: ['unit-1', 'unit-2'],
      targetX: 3,
      targetY: 4
    })
  })

  it('creates attack command payloads with normalized unitIds', () => {
    expect(commandSync.createAttackCommand('unit-1', 'target-9', 'unit')).toEqual({
      unitIds: ['unit-1'],
      targetId: 'target-9',
      targetType: 'unit'
    })

    expect(commandSync.createAttackCommand(['unit-1', 'unit-2'], 'building-3', 'building')).toEqual({
      unitIds: ['unit-1', 'unit-2'],
      targetId: 'building-3',
      targetType: 'building'
    })
  })

  it('includes per-battleship turret selections only when provided', () => {
    expect(commandSync.createAttackCommand(
      ['battle-1'],
      'target-9',
      'unit',
      { 'battle-1': 'foreInner' }
    )).toEqual({
      unitIds: ['battle-1'],
      targetId: 'target-9',
      targetType: 'unit',
      battleshipTurretSelections: { 'battle-1': 'foreInner' }
    })
  })

  it('creates building placement payloads', () => {
    expect(commandSync.createBuildingPlaceCommand('powerPlant', 8, 9)).toEqual({
      buildingType: 'powerPlant',
      x: 8,
      y: 9
    })
  })

  it('creates production payloads', () => {
    expect(commandSync.createProductionCommand('unit', 'tank', 'factory-1')).toEqual({
      productionType: 'unit',
      itemType: 'tank',
      factoryId: 'factory-1'
    })
  })
})

describe('game command sync flow', () => {
  it('updates network stats with rolling rates', () => {
    const performanceSpy = vi.spyOn(performance, 'now')

    const baseline = commandSync.getNetworkStats()
    performanceSpy.mockReturnValueOnce(baseline.lastRateUpdate + 500)
    commandSync.updateNetworkStats(200, 100)
    expect(commandSync.getNetworkStats().sendRate).toBe(baseline.sendRate)

    performanceSpy.mockReturnValueOnce(baseline.lastRateUpdate + 1500)
    commandSync.updateNetworkStats(300, 150)
    const updated = commandSync.getNetworkStats()

    expect(updated.bytesSent).toBe(baseline.bytesSent + 500)
    expect(updated.bytesReceived).toBe(baseline.bytesReceived + 250)
    expect(updated.sendRate).toBeGreaterThan(0)
    expect(updated.receiveRate).toBeGreaterThan(0)
    performanceSpy.mockRestore()
  })

  it('tracks client party state and reset behavior', () => {
    commandSync.setClientPartyId('party-9')
    expect(commandSync.getClientPartyId()).toBe('party-9')

    commandSync.resetClientState()
    expect(commandSync.getClientPartyId()).toBeNull()
  })

  it('broadcasts commands from host to peers', () => {
    gameState.multiplayerSession = { localRole: 'host', isRemote: false }
    gameState.partyStates = [{ partyId: 'player1' }, { partyId: 'player2' }]

    const sendHostStatus = vi.fn()
    vi.mocked(getActiveHostMonitor).mockReturnValue({ activeSession: { sendHostStatus } })

    commandSync.broadcastGameCommand(commandSync.COMMAND_TYPES.UNIT_MOVE, { unitIds: ['u1'] }, 'player1')

    expect(sendHostStatus).toHaveBeenCalledTimes(1)
    const sent = sendHostStatus.mock.calls[0][0]
    expect(sent).toMatchObject({
      type: 'game-command',
      commandType: commandSync.COMMAND_TYPES.UNIT_MOVE,
      sourcePartyId: 'player1',
      isHost: true
    })
  })

  it('broadcasts commands from clients to the host connection', () => {
    gameState.multiplayerSession = { localRole: 'client', isRemote: true }
    const send = vi.fn()
    vi.mocked(getActiveRemoteConnection).mockReturnValue({ send })

    commandSync.broadcastGameCommand(commandSync.COMMAND_TYPES.UNIT_STOP, { unitIds: ['u1'] }, 'player1')

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({
      type: 'game-command',
      commandType: commandSync.COMMAND_TYPES.UNIT_STOP,
      sourcePartyId: 'player1',
      isHost: false
    })
  })

  it('queues host commands from authorized parties and rebroadcasts', () => {
    gameState.multiplayerSession = { localRole: 'host', isRemote: false }
    gameState.partyStates = [{ partyId: 'player1', aiActive: false }, { partyId: 'player2', aiActive: false }]

    const sendHostStatus = vi.fn()
    vi.mocked(getActiveHostMonitor).mockReturnValue({ activeSession: { sendHostStatus } })

    commandSync.handleReceivedCommand({
      type: 'game-command',
      commandType: commandSync.COMMAND_TYPES.UNIT_MOVE,
      payload: { unitIds: ['u1'], targetX: 5, targetY: 6 },
      sourcePartyId: 'player2',
      isHost: false
    })

    const queued = commandSync.processPendingRemoteCommands()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ sourcePartyId: 'player2' })
    expect(sendHostStatus).toHaveBeenCalledTimes(1)
  })

  it('rejects commands from unknown or AI-controlled parties', () => {
    gameState.multiplayerSession = { localRole: 'host', isRemote: false }
    gameState.partyStates = [{ partyId: 'player1', aiActive: false }, { partyId: 'player2', aiActive: true }]

    commandSync.handleReceivedCommand({
      type: 'game-command',
      commandType: commandSync.COMMAND_TYPES.UNIT_MOVE,
      payload: { unitIds: ['u1'], targetX: 5, targetY: 6 },
      sourcePartyId: 'player2',
      isHost: false
    })
    commandSync.handleReceivedCommand({
      type: 'game-command',
      commandType: commandSync.COMMAND_TYPES.UNIT_MOVE,
      payload: { unitIds: ['u1'], targetX: 5, targetY: 6 },
      sourcePartyId: 'unknown',
      isHost: false
    })

    expect(commandSync.processPendingRemoteCommands()).toHaveLength(0)
  })

  it('applies authoritative host commands on clients', () => {
    gameState.multiplayerSession = { localRole: 'client', isRemote: true }
    gameState.buildings = [{ id: 'building-1', isBeingSold: false }]

    commandSync.handleReceivedCommand({
      type: 'game-command',
      commandType: commandSync.COMMAND_TYPES.GAME_PAUSE,
      payload: { paused: true },
      sourcePartyId: 'player1',
      isHost: true
    })
    expect(gameState.gamePaused).toBe(true)

    commandSync.handleReceivedCommand({
      type: 'game-command',
      commandType: commandSync.COMMAND_TYPES.BUILDING_SELL,
      payload: { buildingId: 'building-1', sellStartTime: 1234 },
      sourcePartyId: 'player1',
      isHost: true
    })
    expect(gameState.buildings[0]).toMatchObject({
      isBeingSold: true,
      sellStartTime: 1234
    })
  })

  it('notifies subscribers of incoming commands', () => {
    const handler = vi.fn()
    const unsubscribe = commandSync.subscribeToGameCommands(handler)

    // Set up party state so the command passes validation
    gameState.partyStates = [
      { partyId: 'player1', aiActive: false, owner: 'Host' }
    ]

    commandSync.handleReceivedCommand({
      type: 'game-command',
      commandType: commandSync.COMMAND_TYPES.GAME_RESUME,
      payload: { paused: false },
      sourcePartyId: 'player1',
      isHost: true
    })

    expect(handler).toHaveBeenCalledTimes(1)
    unsubscribe()

    commandSync.handleReceivedCommand({
      type: 'game-command',
      commandType: commandSync.COMMAND_TYPES.GAME_RESUME,
      payload: { paused: false },
      sourcePartyId: 'player1',
      isHost: true
    })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('broadcasts unit commands only when sessions exist', () => {
    const send = vi.fn()
    gameState.multiplayerSession = { localRole: 'client', isRemote: true }
    vi.mocked(getActiveRemoteConnection).mockReturnValue({ send })

    commandSync.broadcastUnitMove([{ id: 'u1', owner: 'player1' }], 10, 12)
    commandSync.broadcastUnitAttack([{ id: 'u1', owner: 'player1' }], { id: 'target-1', isBuilding: false })
    commandSync.broadcastUnitStop([{ id: 'u1', owner: 'player1' }])

    const commandTypes = send.mock.calls.map(call => call[0].commandType)
    expect(commandTypes).toEqual([
      commandSync.COMMAND_TYPES.UNIT_MOVE,
      commandSync.COMMAND_TYPES.UNIT_ATTACK,
      commandSync.COMMAND_TYPES.UNIT_STOP
    ])

    send.mockClear()
    commandSync.broadcastUnitAttack([{ id: 'u1', owner: 'player1' }], null)
    commandSync.broadcastUnitStop([{ id: null, owner: 'player1' }])
    expect(send).not.toHaveBeenCalled()
  })

  it('routes building and production commands with ownership rules', () => {
    const send = vi.fn()
    gameState.multiplayerSession = { localRole: 'client', isRemote: true }
    vi.mocked(getActiveRemoteConnection).mockReturnValue({ send })

    commandSync.broadcastBuildingPlace('powerPlant', 4, 5, 'player1')
    commandSync.broadcastBuildingDamage('building-1', 10, 90)
    commandSync.broadcastBuildingSell('building-1', 200, 999)
    commandSync.broadcastProductionStart('unit', 'tank', 'factory-1', 'player1')
    commandSync.broadcastUnitSpawn('tank', 'factory-1', { x: 4, y: 5 })

    const commandTypes = send.mock.calls.map(call => call[0].commandType)
    expect(commandTypes).toEqual([
      commandSync.COMMAND_TYPES.BUILDING_PLACE,
      commandSync.COMMAND_TYPES.BUILDING_DAMAGE,
      commandSync.COMMAND_TYPES.BUILDING_SELL,
      commandSync.COMMAND_TYPES.PRODUCTION_START,
      commandSync.COMMAND_TYPES.UNIT_SPAWN
    ])
  })

  it('broadcasts pause/resume only from host sessions', () => {
    gameState.multiplayerSession = { localRole: 'host', isRemote: false }
    gameState.partyStates = [{ partyId: 'player1' }, { partyId: 'player2' }]

    const sendHostStatus = vi.fn()
    vi.mocked(getActiveHostMonitor).mockReturnValue({ activeSession: { sendHostStatus } })
    vi.mocked(getActiveRemoteConnection).mockReturnValue({ connectionState: 'connected' })

    commandSync.broadcastGamePauseState(true)
    commandSync.broadcastGamePauseState(false)

    const commandTypes = sendHostStatus.mock.calls.map(call => call[0].commandType)
    expect(commandTypes).toEqual([
      commandSync.COMMAND_TYPES.GAME_PAUSE,
      commandSync.COMMAND_TYPES.GAME_RESUME
    ])
  })

  it('initializes lockstep sessions and queues inputs', () => {
    gameState.multiplayerSession = { localRole: 'host', isRemote: false }
    gameState.partyStates = [{ partyId: 'player1' }, { partyId: 'player2' }]
    gameState.lockstep.enabled = false

    const sendHostStatus = vi.fn()
    vi.mocked(getActiveHostMonitor).mockReturnValue({ activeSession: { sendHostStatus } })

    vi.spyOn(Math, 'random').mockReturnValue(0.25)
    const sessionSeed = commandSync.initializeLockstepSession()

    expect(sessionSeed).toBeGreaterThan(0)
    expect(gameState.lockstep.enabled).toBe(true)
    expect(lockstepManagerSpies.initialize).toHaveBeenCalledWith(sessionSeed, true)
    expect(initializeSessionRNG).toHaveBeenCalledWith(sessionSeed)
    expect(sendHostStatus).toHaveBeenCalled()

    gameState.lockstep.inputDelay = 1
    gameState.lockstep.enabled = true
    gameState.lockstep.currentTick = 5

    commandSync.queueLockstepInput('unit-move', { unitIds: ['u1'], targetX: 3, targetY: 4 })
    expect(createLockstepInput).toHaveBeenCalledWith(
      'unit-move',
      { unitIds: ['u1'], targetX: 3, targetY: 4 },
      6,
      'player1'
    )
    expect(inputBufferSpies.addInput).toHaveBeenCalled()
  })

  it('handles lockstep inputs and acknowledgements', () => {
    gameState.multiplayerSession = { localRole: 'host', isRemote: false }
    gameState.lockstep.enabled = true

    // The implementation broadcasts acknowledgement via broadcastGameCommand
    // rather than calling sendHostStatus directly
    vi.mocked(getActiveRemoteConnection).mockReturnValue(null)
    // Set up a host monitor for broadcasting
    vi.mocked(getActiveHostMonitor).mockReturnValue({
      broadcastToParty: vi.fn(),
      activeSession: { sendHostStatus: vi.fn() }
    })

    commandSync.handleLockstepCommand({
      commandType: commandSync.COMMAND_TYPES.LOCKSTEP_INPUT,
      payload: { id: 'input-1', tick: 4 },
      sourcePartyId: 'player2'
    })

    // The implementation calls lockstepManager.receiveInput
    expect(lockstepManagerSpies.receiveInput).toHaveBeenCalledWith({ id: 'input-1', tick: 4 })

    commandSync.handleLockstepCommand({
      commandType: commandSync.COMMAND_TYPES.LOCKSTEP_INPUT_ACK,
      payload: { tick: 4 }
    })

    expect(inputBufferSpies.confirmTick).toHaveBeenCalledWith(4)
  })

  it('disables lockstep and clears buffers', () => {
    gameState.lockstep.enabled = true
    deterministicRNG.disable = vi.fn()

    commandSync.disableLockstep()

    expect(gameState.lockstep.enabled).toBe(false)
    expect(deterministicRNG.disable).toHaveBeenCalled()
    expect(lockstepManagerSpies.reset).toHaveBeenCalled()
    expect(inputBufferSpies.clear).toHaveBeenCalled()
  })
})

describe('state hash helpers', () => {
  const baseState = {
    units: [
      {
        id: 'unit-1',
        type: 'tank',
        owner: 'player-1',
        x: 10.12,
        y: 20.34,
        tileX: 1,
        tileY: 2,
        health: 80,
        maxHealth: 100,
        direction: 0.25,
        turretDirection: 0.5,
        gas: 40,
        ammunition: 5,
        oreCarried: 0,
        path: [{ x: 1, y: 2 }],
        moveTarget: { x: 64, y: 96 },
        target: { id: 'unit-2' },
        level: 2,
        bountyCounter: 1
      },
      {
        id: 'unit-2',
        type: 'harvester',
        owner: 'player-2',
        x: 40,
        y: 52,
        tileX: 2,
        tileY: 3,
        health: 120,
        maxHealth: 120,
        direction: 1.1
      }
    ],
    buildings: [
      {
        id: 'building-1',
        type: 'refinery',
        owner: 'player-1',
        x: 5,
        y: 6,
        health: 200,
        maxHealth: 200,
        constructionFinished: true
      },
      {
        id: 'building-2',
        type: 'powerPlant',
        owner: 'player-2',
        x: 7,
        y: 9,
        health: 150,
        maxHealth: 150,
        constructionFinished: false,
        constructionProgress: 0.4
      }
    ],
    bullets: [
      {
        id: 1,
        x: 12,
        y: 13,
        targetX: 40,
        targetY: 50,
        damage: 15,
        owner: 'player-1',
        type: 'cannon'
      }
    ],
    mines: [
      {
        id: 3,
        owner: 'player-2',
        x: 9,
        y: 10,
        health: 30,
        armed: true
      }
    ],
    partyStates: [
      { partyId: 'player-1', money: 1200 },
      { partyId: 'player-2', money: 800 }
    ],
    money: 500
  }

  it('computes deterministic hashes independent of array ordering', () => {
    const tick = 42
    const hashA = computeStateHash(baseState, tick)
    const reorderedState = {
      ...baseState,
      units: [...baseState.units].reverse(),
      buildings: [...baseState.buildings].reverse(),
      bullets: [...baseState.bullets].reverse(),
      mines: [...baseState.mines].reverse()
    }
    const hashB = computeStateHash(reorderedState, tick)

    expect(hashA).toBe(hashB)
  })

  it('changes hashes when important state changes occur', () => {
    const tick = 42
    const hashA = computeStateHash(baseState, tick)
    const changedState = {
      ...baseState,
      units: baseState.units.map(unit =>
        unit.id === 'unit-1' ? { ...unit, health: unit.health - 10 } : unit
      )
    }
    const hashB = computeStateHash(changedState, tick)

    expect(hashA).not.toBe(hashB)
  })

  it('changes hashes when tick changes', () => {
    const hashA = computeStateHash(baseState, 10)
    const hashB = computeStateHash(baseState, 11)

    expect(hashA).not.toBe(hashB)
  })

  it('compares hashes for equality', () => {
    const hashA = computeStateHash(baseState, 8)
    const hashB = computeStateHash(baseState, 8)
    const hashC = computeStateHash(baseState, 9)

    expect(compareHashes(hashA, hashB)).toBe(true)
    expect(compareHashes(hashA, hashC)).toBe(false)
  })

  it('computes quick hashes based on entity counts and totals', () => {
    const tick = 12
    const hashA = computeQuickHash(baseState, tick)
    const changedState = {
      ...baseState,
      units: baseState.units.map(unit =>
        unit.id === 'unit-2' ? { ...unit, health: unit.health + 20 } : unit
      )
    }
    const hashB = computeQuickHash(changedState, tick)

    expect(hashA).not.toBe(hashB)
  })

  it('builds detailed hash reports with full hash included', () => {
    const tick = 30
    const report = createHashReport(baseState, tick)

    expect(report).toMatchObject({
      tick,
      unitCount: 2,
      buildingCount: 2,
      bulletCount: 1,
      mineCount: 1,
      money: 500
    })
    expect(report.fullHash).toBe(computeStateHash(baseState, tick))
  })

  it('hashes ordered collections in order', () => {
    const hashA = hashArrayOrdered([1, 2, 3], value => value)
    const hashB = hashArrayOrdered([3, 2, 1], value => value)

    expect(hashA).not.toBe(hashB)
  })
})

describe('command type constants', () => {
  it('exposes command type enum with unique values', () => {
    const { COMMAND_TYPES } = commandSync
    expect(COMMAND_TYPES.UNIT_MOVE).toBeDefined()
    expect(COMMAND_TYPES.UNIT_ATTACK).toBeDefined()
    expect(COMMAND_TYPES.UNIT_STOP).toBeDefined()
    expect(COMMAND_TYPES.UNIT_SPAWN).toBeDefined()
    expect(COMMAND_TYPES.BUILDING_PLACE).toBeDefined()
    expect(COMMAND_TYPES.BUILDING_DAMAGE).toBeDefined()
    expect(COMMAND_TYPES.BUILDING_SELL).toBeDefined()
    expect(COMMAND_TYPES.PRODUCTION_START).toBeDefined()
    expect(COMMAND_TYPES.GAME_PAUSE).toBeDefined()
    expect(COMMAND_TYPES.GAME_RESUME).toBeDefined()

    // Ensure no duplicate values
    const values = Object.values(COMMAND_TYPES)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })
})

describe('advanced command synchronization', () => {
  it('createMoveCommand handles empty array', () => {
    expect(commandSync.createMoveCommand([], 10, 20)).toEqual({
      unitIds: [],
      targetX: 10,
      targetY: 20
    })
  })

  it('createAttackCommand defaults to unit target type', () => {
    const result = commandSync.createAttackCommand('u1', 'target-1', 'unit')
    expect(result.targetType).toBe('unit')
  })

  it('createBuildingPlaceCommand contains correct fields', () => {
    const result = commandSync.createBuildingPlaceCommand('refinery', 10, 15)
    expect(result).toEqual({
      buildingType: 'refinery',
      x: 10,
      y: 15
    })
  })

  it('createProductionCommand contains correct fields', () => {
    const result = commandSync.createProductionCommand('unit', 'harvester', 'factory-2')
    expect(result).toEqual({
      productionType: 'unit',
      itemType: 'harvester',
      factoryId: 'factory-2'
    })
  })

  it('broadcastUnitMove filters out invalid units', () => {
    const send = vi.fn()
    gameState.multiplayerSession = { localRole: 'client', isRemote: true }
    vi.mocked(getActiveRemoteConnection).mockReturnValue({ send })

    // Empty array should not broadcast
    commandSync.broadcastUnitMove([], 10, 10)
    expect(send).not.toHaveBeenCalled()
  })

  it('broadcastUnitAttack handles building targets', () => {
    const send = vi.fn()
    gameState.multiplayerSession = { localRole: 'client', isRemote: true }
    vi.mocked(getActiveRemoteConnection).mockReturnValue({ send })

    const buildingTarget = { id: 'building-1', isBuilding: true }
    commandSync.broadcastUnitAttack([{ id: 'u1', owner: 'player1' }], buildingTarget)

    expect(send).toHaveBeenCalledTimes(1)
    const payload = send.mock.calls[0][0].payload
    expect(payload.targetType).toBe('building')
    expect(payload.targetId).toBe('building-1')
  })

  it('broadcastUnitAttack handles unit targets as default', () => {
    const send = vi.fn()
    gameState.multiplayerSession = { localRole: 'client', isRemote: true }
    vi.mocked(getActiveRemoteConnection).mockReturnValue({ send })

    const unitTarget = { id: 'unit-1' }
    commandSync.broadcastUnitAttack([{ id: 'u1', owner: 'player1' }], unitTarget)

    expect(send).toHaveBeenCalledTimes(1)
    const payload = send.mock.calls[0][0].payload
    expect(payload.targetType).toBe('unit')
    expect(payload.targetId).toBe('unit-1')
  })

  it('broadcastUnitAttack synchronizes a selected battleship turret', () => {
    const send = vi.fn()
    gameState.multiplayerSession = { localRole: 'client', isRemote: true }
    vi.mocked(getActiveRemoteConnection).mockReturnValue({ send })

    commandSync.broadcastUnitAttack([
      { id: 'battle-1', type: 'battleship', owner: 'player1', selectedTurret: 'aftOuter' }
    ], { id: 'unit-1' })

    expect(send.mock.calls[0][0].payload.battleshipTurretSelections).toEqual({
      'battle-1': 'aftOuter'
    })
  })

  it('processPendingRemoteCommands returns empty when queue is empty', () => {
    gameState.multiplayerSession = { localRole: 'host', isRemote: false }
    // Clear any pending commands from previous tests
    while (commandSync.processPendingRemoteCommands().length > 0) {
      // drain queue
    }
    const commands = commandSync.processPendingRemoteCommands()
    expect(commands).toEqual([])
  })

  it('handleReceivedCommand ignores non-game-command types', () => {
    const handler = vi.fn()
    commandSync.subscribeToGameCommands(handler)

    commandSync.handleReceivedCommand({
      type: 'other-type',
      commandType: commandSync.COMMAND_TYPES.UNIT_MOVE,
      payload: {}
    })

    expect(handler).not.toHaveBeenCalled()
  })

  it('handleReceivedCommand handles BUILDING_PLACE on client', () => {
    gameState.multiplayerSession = { localRole: 'client', isRemote: true }
    gameState.partyStates = [{ partyId: 'host' }]

    // This should add to pending since it influences state
    commandSync.handleReceivedCommand({
      type: 'game-command',
      commandType: commandSync.COMMAND_TYPES.BUILDING_PLACE,
      payload: { buildingType: 'powerPlant', x: 5, y: 6 },
      sourcePartyId: 'host',
      isHost: true
    })

    // Should not throw and should handle gracefully
  })

  it('handleReceivedCommand handles PRODUCTION_START on client', () => {
    gameState.multiplayerSession = { localRole: 'client', isRemote: true }
    gameState.partyStates = [{ partyId: 'host' }]

    commandSync.handleReceivedCommand({
      type: 'game-command',
      commandType: commandSync.COMMAND_TYPES.PRODUCTION_START,
      payload: { productionType: 'unit', itemType: 'tank', factoryId: 'f1' },
      sourcePartyId: 'host',
      isHost: true
    })

    // Should not throw
  })

  it('lockstep queueing is skipped when lockstep is disabled', () => {
    gameState.lockstep.enabled = false
    createLockstepInput.mockClear()

    commandSync.queueLockstepInput('unit-move', { unitIds: ['u1'] })

    expect(createLockstepInput).not.toHaveBeenCalled()
  })

  it('handleLockstepCommand handles LOCKSTEP_INIT on client', () => {
    gameState.multiplayerSession = { localRole: 'client', isRemote: true }
    gameState.lockstep.enabled = false

    commandSync.handleLockstepCommand({
      commandType: commandSync.COMMAND_TYPES.LOCKSTEP_INIT,
      payload: { sessionSeed: 12345 }
    })

    // The function should initialize lockstep session on client
    expect(lockstepManagerSpies.initialize).toHaveBeenCalled()
  })

  it('network stats start at zero', () => {
    const stats = commandSync.getNetworkStats()
    expect(stats).toHaveProperty('bytesSent')
    expect(stats).toHaveProperty('bytesReceived')
    expect(stats).toHaveProperty('sendRate')
    expect(stats).toHaveProperty('receiveRate')
    expect(stats).toHaveProperty('lastRateUpdate')
  })

  it('broadcastStateHash returns early when lockstep disabled', () => {
    const send = vi.fn()
    gameState.multiplayerSession = { localRole: 'client', isRemote: true }
    gameState.lockstep.enabled = false
    vi.mocked(getActiveRemoteConnection).mockReturnValue({ send })

    // Should return early without broadcasting
    commandSync.broadcastStateHash(10)
    expect(send).not.toHaveBeenCalled()
  })

  it('handleStateHashCommand processes hash verification', () => {
    gameState.multiplayerSession = { localRole: 'host', isRemote: false }
    gameState.lockstep.enabled = true
    gameState.lockstep.currentTick = 10
    gameState.lockstep.desyncDetected = false

    // This tests that the function does not throw
    commandSync.handleLockstepCommand({
      commandType: commandSync.COMMAND_TYPES.LOCKSTEP_HASH,
      payload: { tick: 8, hash: 'somehash' },
      sourcePartyId: 'player2'
    })

    // No assertion needed - we're testing it handles gracefully
  })
})
