import { beforeEach, describe, expect, it, vi } from 'vitest'

import '../setup.js'

import { gameState } from '../../src/gameState.js'
import {
  applyRemoteControlSnapshot,
  clearRemoteControlAbsoluteSource,
  clearRemoteControlSource,
  getRemoteControlAbsolute,
  getRemoteControlActionState,
  getRemoteControlActions,
  releaseRemoteControlSource,
  setRemoteControlAbsolute,
  setRemoteControlAction
} from '../../src/input/remoteControlState.js'
import { getActiveRemoteConnection } from '../../src/network/remoteConnection.js'

vi.mock('../../src/network/remoteConnection.js', () => ({
  getActiveRemoteConnection: vi.fn(),
  RemoteConnectionStatus: {
    IDLE: 'idle',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    FAILED: 'failed',
    DISCONNECTED: 'disconnected'
  }
}))

vi.mock('../../src/replaySystem.js', () => ({
  createReplayUnitReferences: vi.fn(() => []),
  isReplayInteractionLocked: vi.fn(() => false),
  recordReplayCommand: vi.fn()
}))

const mockConnection = {
  send: vi.fn()
}

const defaultMultiplayerSession = { ...gameState.multiplayerSession }

describe('remoteControlState', () => {
  beforeEach(() => {
    gameState.remoteControl = {}
    gameState.remoteControlSources = null
    gameState.remoteControlAbsolute = null
    gameState.remoteControlAbsoluteSources = null
    gameState.multiplayerSession = { ...defaultMultiplayerSession, isRemote: false }

    mockConnection.send.mockClear()
    vi.mocked(getActiveRemoteConnection).mockReturnValue(null)
  })

  it('throws when setting an unsupported action or missing source', () => {
    expect(() => setRemoteControlAction('not-real', 'source', true)).toThrow(
      'Unsupported remote control action'
    )
    expect(() => setRemoteControlAction('forward', '', true)).toThrow(
      'Remote control source identifier is required'
    )
  })

  it('clamps intensities and broadcasts when remote session is active', () => {
    gameState.multiplayerSession = { ...defaultMultiplayerSession, isRemote: true }
    vi.mocked(getActiveRemoteConnection).mockReturnValue(mockConnection)

    setRemoteControlAction('forward', 'keyboard', true, 2)

    expect(gameState.remoteControlSources.forward.keyboard).toBe(1)
    expect(getRemoteControlActionState('forward')).toBe(1)
    expect(mockConnection.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'remote-control',
        actions: expect.objectContaining({ forward: 1 })
      })
    )
  })

  it('removes sources when intensity is zero and recomputes max intensity', () => {
    setRemoteControlAction('fire', 'alpha', true, 0.4)
    setRemoteControlAction('fire', 'beta', true, 0.9)

    expect(getRemoteControlActionState('fire')).toBe(0.9)

    setRemoteControlAction('fire', 'beta', false)
    expect(getRemoteControlActionState('fire')).toBe(0.4)

    setRemoteControlAction('fire', 'alpha', true, 0)
    expect(getRemoteControlActionState('fire')).toBe(0)
    expect(gameState.remoteControlSources.fire).toEqual({})
  })

  it('clears a source across actions and broadcasts once', () => {
    setRemoteControlAction('forward', 'pad', true, 0.6)
    setRemoteControlAction('backward', 'pad', true, 0.4)

    gameState.multiplayerSession = { ...defaultMultiplayerSession, isRemote: true }
    vi.mocked(getActiveRemoteConnection).mockReturnValue(mockConnection)
    mockConnection.send.mockClear()

    clearRemoteControlSource('pad')

    expect(getRemoteControlActionState('forward')).toBe(0)
    expect(getRemoteControlActionState('backward')).toBe(0)
    expect(mockConnection.send).toHaveBeenCalledTimes(1)
  })

  it('selects the strongest absolute sources and clamps inputs', () => {
    setRemoteControlAbsolute('pilot-a', {
      wagonDirection: 90,
      wagonSpeed: 0.4,
      turretDirection: 10,
      turretTurnFactor: 1.6
    })
    setRemoteControlAbsolute('pilot-b', {
      wagonDirection: 180,
      wagonSpeed: 0.8,
      turretDirection: 40,
      turretTurnFactor: 0.3
    })

    expect(getRemoteControlAbsolute()).toEqual({
      wagonDirection: 180,
      wagonSpeed: 0.8,
      turretDirection: 10,
      turretTurnFactor: 1
    })
  })

  it('removes empty absolute sources and resets defaults', () => {
    setRemoteControlAbsolute('pilot', {
      wagonDirection: 45,
      wagonSpeed: 0.5
    })

    setRemoteControlAbsolute('pilot', {
      wagonDirection: null,
      wagonSpeed: 0,
      turretDirection: null,
      turretTurnFactor: 0
    })

    expect(gameState.remoteControlAbsoluteSources).toEqual({})
    expect(getRemoteControlAbsolute()).toEqual({
      wagonDirection: null,
      wagonSpeed: 0,
      turretDirection: null,
      turretTurnFactor: 0
    })
  })

  it('clears absolute sources and broadcasts when remote', () => {
    gameState.multiplayerSession = { ...defaultMultiplayerSession, isRemote: true }
    vi.mocked(getActiveRemoteConnection).mockReturnValue(mockConnection)

    setRemoteControlAbsolute('pilot', {
      wagonDirection: 90,
      wagonSpeed: 0.6
    })
    mockConnection.send.mockClear()

    clearRemoteControlAbsoluteSource('pilot')

    expect(mockConnection.send).toHaveBeenCalledTimes(1)
    expect(getRemoteControlAbsolute()).toEqual({
      wagonDirection: null,
      wagonSpeed: 0,
      turretDirection: null,
      turretTurnFactor: 0
    })
  })

  it('applies snapshots, ignoring unsupported actions', () => {
    setRemoteControlAction('forward', 'sync', true, 0.7)

    applyRemoteControlSnapshot('sync', {
      actions: {
        forward: 0,
        turnLeft: 2,
        warp: 1
      },
      absolute: {
        wagonDirection: 30,
        wagonSpeed: 0.5
      }
    })

    expect(getRemoteControlActionState('forward')).toBe(0)
    expect(getRemoteControlActionState('turnLeft')).toBe(1)
    expect(getRemoteControlActions()).not.toContain('warp')
    expect(getRemoteControlAbsolute()).toEqual({
      wagonDirection: 30,
      wagonSpeed: 0.5,
      turretDirection: null,
      turretTurnFactor: 0
    })
  })

  it('releases action and absolute sources together', () => {
    setRemoteControlAction('turnRight', 'release', true, 0.5)
    setRemoteControlAbsolute('release', {
      wagonDirection: 120,
      wagonSpeed: 0.7
    })

    releaseRemoteControlSource('release')

    expect(getRemoteControlActionState('turnRight')).toBe(0)
    expect(getRemoteControlAbsolute()).toEqual({
      wagonDirection: null,
      wagonSpeed: 0,
      turretDirection: null,
      turretTurnFactor: 0
    })
  })
})
