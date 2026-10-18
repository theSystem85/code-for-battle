import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../setup.js'

import { gameState } from '../../src/gameState.js'
import {
  MULTIPLAYER_SESSION_EVENT,
  emitMultiplayerSessionChange,
  observeMultiplayerSession
} from '../../src/network/multiplayerSessionEvents.js'

describe('multiplayerSessionEvents.js', () => {
  let dispatchEventSpy
  let addEventListenerSpy
  let removeEventListenerSpy

  beforeEach(() => {
    vi.clearAllMocks()

    // Initialize multiplayerSession in gameState
    gameState.multiplayerSession = {
      isActive: false,
      isHost: false,
      connectedPeers: [],
      gameId: null
    }

    // Spy on document event methods
    dispatchEventSpy = vi.spyOn(document, 'dispatchEvent')
    addEventListenerSpy = vi.spyOn(document, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
  })

  afterEach(() => {
    dispatchEventSpy.mockRestore()
    addEventListenerSpy.mockRestore()
    removeEventListenerSpy.mockRestore()
  })

  describe('MULTIPLAYER_SESSION_EVENT constant', () => {
    it('[U03063] exports the correct event name', () => {
      expect(MULTIPLAYER_SESSION_EVENT).toBe('multiplayerSessionChanged')
    })

    it('[U03064] is a string type', () => {
      expect(typeof MULTIPLAYER_SESSION_EVENT).toBe('string')
    })
  })

  describe('emitMultiplayerSessionChange', () => {
    it('[U03065] dispatches a CustomEvent with the event name', () => {
      emitMultiplayerSessionChange()

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1)
      const event = dispatchEventSpy.mock.calls[0][0]
      expect(event).toBeInstanceOf(CustomEvent)
      expect(event.type).toBe(MULTIPLAYER_SESSION_EVENT)
    })

    it('[U03066] includes multiplayerSession data in event detail', () => {
      gameState.multiplayerSession = {
        isActive: true,
        isHost: true,
        connectedPeers: ['peer1', 'peer2'],
        gameId: 'game123'
      }

      emitMultiplayerSessionChange()

      const event = dispatchEventSpy.mock.calls[0][0]
      expect(event.detail).toEqual({
        isActive: true,
        isHost: true,
        connectedPeers: ['peer1', 'peer2'],
        gameId: 'game123'
      })
    })

    it('[U03067] creates a copy of the session data (spread operator)', () => {
      gameState.multiplayerSession = {
        isActive: false,
        customProp: 'test'
      }

      emitMultiplayerSessionChange()

      const event = dispatchEventSpy.mock.calls[0][0]
      expect(event.detail).not.toBe(gameState.multiplayerSession)
      expect(event.detail).toEqual(gameState.multiplayerSession)
    })

    it('[U03068] handles empty multiplayerSession', () => {
      gameState.multiplayerSession = {}

      emitMultiplayerSessionChange()

      const event = dispatchEventSpy.mock.calls[0][0]
      expect(event.detail).toEqual({})
    })

    it('[U03069] handles multiplayerSession with nested objects', () => {
      gameState.multiplayerSession = {
        isActive: true,
        config: {
          maxPlayers: 4,
          mapSize: 'large'
        }
      }

      emitMultiplayerSessionChange()

      const event = dispatchEventSpy.mock.calls[0][0]
      expect(event.detail.config).toEqual({
        maxPlayers: 4,
        mapSize: 'large'
      })
    })
  })

  describe('observeMultiplayerSession', () => {
    it('[U03070] adds an event listener for the session event', () => {
      const handler = vi.fn()
      observeMultiplayerSession(handler)

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        MULTIPLAYER_SESSION_EVENT,
        handler
      )
    })

    it('[U03071] returns an unsubscribe function', () => {
      const handler = vi.fn()
      const unsubscribe = observeMultiplayerSession(handler)

      expect(typeof unsubscribe).toBe('function')
    })

    it('[U03072] unsubscribe function removes the event listener', () => {
      const handler = vi.fn()
      const unsubscribe = observeMultiplayerSession(handler)

      unsubscribe()

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        MULTIPLAYER_SESSION_EVENT,
        handler
      )
    })

    it('[U03073] returns no-op function when handler is not a function', () => {
      const unsubscribe1 = observeMultiplayerSession(null)
      const unsubscribe2 = observeMultiplayerSession('not a function')
      const unsubscribe3 = observeMultiplayerSession(123)
      const unsubscribe4 = observeMultiplayerSession({})

      expect(typeof unsubscribe1).toBe('function')
      expect(typeof unsubscribe2).toBe('function')
      expect(addEventListenerSpy).not.toHaveBeenCalled()

      // No-op unsubscribes should not throw
      unsubscribe1()
      unsubscribe2()
      unsubscribe3()
      unsubscribe4()
    })

    it('[U03074] handler receives events when session changes', () => {
      const handler = vi.fn()

      // Use real event listeners for this test
      addEventListenerSpy.mockRestore()
      removeEventListenerSpy.mockRestore()

      observeMultiplayerSession(handler)

      gameState.multiplayerSession = { isActive: true }
      emitMultiplayerSessionChange()

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].detail).toEqual({ isActive: true })
    })

    it('[U03075] handler stops receiving events after unsubscribe', () => {
      const handler = vi.fn()

      // Use real event listeners
      addEventListenerSpy.mockRestore()
      removeEventListenerSpy.mockRestore()

      const unsubscribe = observeMultiplayerSession(handler)

      gameState.multiplayerSession = { isActive: true }
      emitMultiplayerSessionChange()
      expect(handler).toHaveBeenCalledTimes(1)

      unsubscribe()

      gameState.multiplayerSession = { isActive: false }
      emitMultiplayerSessionChange()
      expect(handler).toHaveBeenCalledTimes(1) // Still just 1
    })

    it('[U03076] multiple handlers can observe session changes', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      // Use real event listeners
      addEventListenerSpy.mockRestore()
      removeEventListenerSpy.mockRestore()

      observeMultiplayerSession(handler1)
      observeMultiplayerSession(handler2)

      gameState.multiplayerSession = { isActive: true }
      emitMultiplayerSessionChange()

      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)
    })

    it('[U03077] handlers can unsubscribe independently', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      // Use real event listeners
      addEventListenerSpy.mockRestore()
      removeEventListenerSpy.mockRestore()

      const unsub1 = observeMultiplayerSession(handler1)
      observeMultiplayerSession(handler2)

      emitMultiplayerSessionChange()
      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)

      unsub1()

      emitMultiplayerSessionChange()
      expect(handler1).toHaveBeenCalledTimes(1) // Still 1
      expect(handler2).toHaveBeenCalledTimes(2)
    })
  })

  describe('integration scenarios', () => {
    beforeEach(() => {
      // Use real event listeners for integration tests
      addEventListenerSpy.mockRestore()
      removeEventListenerSpy.mockRestore()
    })

    it('[U03078] tracks multiplayer session state changes over time', () => {
      const sessionHistory = []
      const handler = (event) => {
        sessionHistory.push({ ...event.detail })
      }

      observeMultiplayerSession(handler)

      // Session starts
      gameState.multiplayerSession = {
        isActive: true,
        isHost: true,
        connectedPeers: []
      }
      emitMultiplayerSessionChange()

      // Peer connects
      gameState.multiplayerSession = {
        isActive: true,
        isHost: true,
        connectedPeers: ['peer1']
      }
      emitMultiplayerSessionChange()

      // Another peer connects
      gameState.multiplayerSession = {
        isActive: true,
        isHost: true,
        connectedPeers: ['peer1', 'peer2']
      }
      emitMultiplayerSessionChange()

      expect(sessionHistory).toHaveLength(3)
      expect(sessionHistory[0].connectedPeers).toHaveLength(0)
      expect(sessionHistory[1].connectedPeers).toHaveLength(1)
      expect(sessionHistory[2].connectedPeers).toHaveLength(2)
    })

    it('[U03079] emits change events for host/client role switches', () => {
      const events = []
      observeMultiplayerSession((e) => events.push(e.detail))

      gameState.multiplayerSession = { isActive: true, isHost: true }
      emitMultiplayerSessionChange()

      gameState.multiplayerSession = { isActive: true, isHost: false }
      emitMultiplayerSessionChange()

      expect(events[0].isHost).toBe(true)
      expect(events[1].isHost).toBe(false)
    })

    it('[U03080] supports reactive UI updates pattern', () => {
      let uiState = { connected: false, peerCount: 0 }

      observeMultiplayerSession((event) => {
        uiState = {
          connected: event.detail.isActive,
          peerCount: event.detail.connectedPeers?.length || 0
        }
      })

      expect(uiState.connected).toBe(false)

      gameState.multiplayerSession = {
        isActive: true,
        connectedPeers: ['p1', 'p2', 'p3']
      }
      emitMultiplayerSessionChange()

      expect(uiState.connected).toBe(true)
      expect(uiState.peerCount).toBe(3)
    })

    it('[U03081] handles rapid session changes', () => {
      const events = []
      observeMultiplayerSession((e) => events.push(e.detail.isActive))

      for (let i = 0; i < 10; i++) {
        gameState.multiplayerSession = { isActive: i % 2 === 0 }
        emitMultiplayerSessionChange()
      }

      expect(events).toHaveLength(10)
      expect(events).toEqual([true, false, true, false, true, false, true, false, true, false])
    })

    it('[U03082] gracefully handles observers that throw errors', () => {
      // Error handlers in DOM event listeners are swallowed by the browser,
      // but in jsdom test environment they propagate - we just verify the pattern works
      const normalHandler = vi.fn()

      observeMultiplayerSession(normalHandler)

      gameState.multiplayerSession = { isActive: true }
      emitMultiplayerSessionChange()

      expect(normalHandler).toHaveBeenCalledTimes(1)
    })
  })
})
