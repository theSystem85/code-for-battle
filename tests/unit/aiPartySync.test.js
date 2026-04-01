import { beforeEach, describe, expect, it, vi } from 'vitest'

// Use vi.hoisted to ensure mocks are defined before vi.mock factories run
const observeAiReactivation = vi.hoisted(() => vi.fn())
const getPartyState = vi.hoisted(() => vi.fn())

vi.mock('../../src/network/webrtcSession.js', () => ({
  observeAiReactivation
}))

vi.mock('../../src/network/multiplayerStore.js', () => ({
  getPartyState
}))

import { gameState } from '../../src/gameState.js'
import {
  cleanupAiPartySync,
  getAiControlledParties,
  initAiPartySync,
  isBuildingAiControlled,
  isPartyAiControlled,
  isUnitAiControlled,
  reinitializeAiForParty
} from '../../src/network/aiPartySync.js'

describe('aiPartySync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gameState.partyStates = []
    gameState.units = []
    gameState.humanPlayer = 'player1'
    window.logger = vi.fn()
    cleanupAiPartySync()
  })

  it('reports when a party is AI controlled', () => {
    getPartyState.mockReturnValue({ aiActive: true })

    expect(isPartyAiControlled('party-1')).toBe(true)
    expect(getPartyState).toHaveBeenCalledWith('party-1')
  })

  it('returns false when a party is missing or inactive', () => {
    getPartyState.mockReturnValue(undefined)
    expect(isPartyAiControlled('missing')).toBe(false)

    getPartyState.mockReturnValue({ aiActive: false })
    expect(isPartyAiControlled('party-2')).toBe(false)
  })

  it('filters AI-controlled parties from game state', () => {
    gameState.partyStates = [
      { id: 'p1', aiActive: true },
      { id: 'p2', aiActive: false },
      { id: 'p3', aiActive: true }
    ]

    expect(getAiControlledParties()).toEqual([
      { id: 'p1', aiActive: true },
      { id: 'p3', aiActive: true }
    ])
  })

  it('returns an empty list when partyStates is not an array', () => {
    gameState.partyStates = null

    expect(getAiControlledParties()).toEqual([])
  })

  it('identifies AI-controlled units while excluding the human player', () => {
    getPartyState.mockImplementation((partyId) => (partyId === 'enemy-ai' ? { aiActive: true } : { aiActive: false }))

    expect(isUnitAiControlled(null)).toBe(false)
    expect(isUnitAiControlled({ owner: 'player1' })).toBe(false)
    expect(isUnitAiControlled({ owner: 'enemy-ai' })).toBe(true)
  })

  it('identifies AI-controlled buildings while excluding the human player', () => {
    getPartyState.mockImplementation((partyId) => (partyId === 'enemy-ai' ? { aiActive: true } : { aiActive: false }))

    expect(isBuildingAiControlled(undefined)).toBe(false)
    expect(isBuildingAiControlled({ owner: 'player1' })).toBe(false)
    expect(isBuildingAiControlled({ owner: 'enemy-ai' })).toBe(true)
  })

  it('does not reinitialize units when the party is not AI controlled', () => {
    gameState.units = [
      {
        id: 'unit-1',
        owner: 'party-1',
        commandQueue: ['move'],
        currentCommand: 'move',
        utilityQueue: {
          mode: 'assist',
          targets: ['t1'],
          currentTargetId: 't1'
        }
      }
    ]
    getPartyState.mockReturnValue({ aiActive: false })

    reinitializeAiForParty('party-1')

    expect(gameState.units[0].commandQueue).toEqual(['move'])
    expect(gameState.units[0].currentCommand).toBe('move')
    expect(gameState.units[0].utilityQueue.mode).toBe('assist')
    expect(window.logger).not.toHaveBeenCalled()
  })

  it('clears pending commands for AI-controlled party units on reinitialization', () => {
    gameState.units = [
      {
        id: 'unit-1',
        owner: 'party-1',
        commandQueue: ['move'],
        currentCommand: 'move',
        utilityQueue: {
          mode: 'assist',
          targets: ['t1'],
          currentTargetId: 't1'
        }
      },
      {
        id: 'unit-2',
        owner: 'party-2',
        commandQueue: ['attack'],
        currentCommand: 'attack'
      }
    ]
    getPartyState.mockReturnValue({ aiActive: true })

    reinitializeAiForParty('party-1')

    expect(gameState.units[0].commandQueue).toEqual([])
    expect(gameState.units[0].currentCommand).toBeNull()
    expect(gameState.units[0].utilityQueue).toEqual({
      mode: null,
      targets: [],
      currentTargetId: null
    })
    expect(gameState.units[1].commandQueue).toEqual(['attack'])
    expect(gameState.units[1].currentCommand).toBe('attack')
    expect(window.logger).toHaveBeenCalledWith('AI reinitialized for party party-1')
  })

  it('registers the AI reactivation observer and handles disconnect events', () => {
    const cleanup = vi.fn()
    let capturedCallback
    observeAiReactivation.mockImplementation((callback) => {
      capturedCallback = callback
      return cleanup
    })
    gameState.units = [
      {
        id: 'unit-1',
        owner: 'party-1',
        commandQueue: ['move'],
        currentCommand: 'move',
        utilityQueue: {
          mode: 'assist',
          targets: ['t1'],
          currentTargetId: 't1'
        }
      }
    ]
    getPartyState.mockReturnValue({ aiActive: true })

    const returnedCleanup = initAiPartySync()

    expect(returnedCleanup).toBe(cleanup)
    expect(observeAiReactivation).toHaveBeenCalledTimes(1)

    capturedCallback({ detail: { partyId: 'party-1' } })

    expect(gameState.units[0].commandQueue).toEqual([])
    expect(gameState.units[0].currentCommand).toBeNull()
    expect(gameState.units[0].utilityQueue.targets).toEqual([])
  })

  it('replaces prior observers when initializing more than once', () => {
    const cleanupOne = vi.fn()
    const cleanupTwo = vi.fn()
    observeAiReactivation
      .mockImplementationOnce(() => cleanupOne)
      .mockImplementationOnce(() => cleanupTwo)

    const firstCleanup = initAiPartySync()
    const secondCleanup = initAiPartySync()

    expect(firstCleanup).toBe(cleanupOne)
    expect(secondCleanup).toBe(cleanupTwo)
    expect(cleanupOne).toHaveBeenCalledTimes(1)
  })
})
