import { beforeEach, describe, expect, it, vi } from 'vitest'

import '../setup.js'

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    units: [],
    buildings: [],
    bullets: []
  }
}))

// Use vi.hoisted to ensure mocks are defined before vi.mock factories run
const mockDeterministicRNG = vi.hoisted(() => ({
  enable: vi.fn(),
  disable: vi.fn(),
  getState: vi.fn(() => ({ seed: 1, callCount: 0, enabled: true })),
  setState: vi.fn(),
  getCallCount: vi.fn(() => 0)
}))

const mockInitializeSessionRNG = vi.hoisted(() => vi.fn())
const mockSyncRNGForTick = vi.hoisted(() => vi.fn())

vi.mock('../../src/network/deterministicRandom.js', () => ({
  deterministicRNG: mockDeterministicRNG,
  initializeSessionRNG: mockInitializeSessionRNG,
  syncRNGForTick: mockSyncRNGForTick
}))

const mockComputeStateHash = vi.hoisted(() => vi.fn(() => 'hash-0'))
const mockCompareHashes = vi.hoisted(() => vi.fn((localHash, remoteHash) => localHash === remoteHash))

vi.mock('../../src/network/stateHash.js', () => ({
  computeStateHash: mockComputeStateHash,
  compareHashes: mockCompareHashes
}))

import { INPUT_DELAY_TICKS } from '../../src/network/inputBuffer.js'
import { LOCKSTEP_CONFIG, MS_PER_TICK, lockstepManager } from '../../src/network/lockstepManager.js'
import { gameState } from '../../src/gameState.js'
import { deterministicRNG, initializeSessionRNG, syncRNGForTick } from '../../src/network/deterministicRandom.js'
import { compareHashes, computeStateHash } from '../../src/network/stateHash.js'

describe('lockstepManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lockstepManager.disable()
    lockstepManager.initialize('seed-1', 'local-peer', ['local-peer', 'peer-a'])
  })

  it('[U02386] initializes session state and peer tracking', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(500)

    lockstepManager.initialize('seed-42', 'local-peer', ['local-peer', 'peer-a', 'peer-b'])

    expect(initializeSessionRNG).toHaveBeenCalledWith('seed-42', true)
    expect(lockstepManager.getCurrentTick()).toBe(0)

    const stats = lockstepManager.getStats()
    expect(stats).toMatchObject({
      currentTick: 0,
      peerCount: 2,
      enabled: false
    })

    const peerStates = lockstepManager.getPeerStates()
    expect(peerStates).toHaveLength(2)
    expect(peerStates).toEqual(expect.arrayContaining([
      expect.objectContaining({ peerId: 'peer-a', lastConfirmedTick: 0, isConnected: true }),
      expect.objectContaining({ peerId: 'peer-b', lastConfirmedTick: 0, isConnected: true })
    ]))

    nowSpy.mockRestore()
  })

  it('[U02387] toggles deterministic RNG when enabling and disabling', () => {
    lockstepManager.enable()
    expect(deterministicRNG.enable).toHaveBeenCalled()
    expect(lockstepManager.isEnabled()).toBe(true)

    lockstepManager.disable()
    expect(deterministicRNG.disable).toHaveBeenCalled()
    expect(lockstepManager.isEnabled()).toBe(false)
  })

  it('[U02388] buffers local inputs with delay and broadcasts them', () => {
    const broadcastSpy = vi.fn()
    lockstepManager.setOnBroadcastInput(broadcastSpy)

    lockstepManager.queueLocalInput({
      type: 'move',
      payload: { x: 5, y: 7 }
    })

    const targetTick = INPUT_DELAY_TICKS

    expect(broadcastSpy).toHaveBeenCalledWith(targetTick, {
      type: 'move',
      payload: { x: 5, y: 7 }
    })

    const inputs = lockstepManager.getInputsForTick(targetTick)
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toMatchObject({
      peerId: 'local-peer',
      tick: targetTick,
      type: 'move',
      payload: { x: 5, y: 7 }
    })
  })

  it('[U02389] records remote inputs and notifies listeners', () => {
    const onInputReceived = vi.fn()
    lockstepManager.setOnInputReceived(onInputReceived)

    lockstepManager.receiveRemoteInput('peer-a', 4, {
      type: 'attack',
      payload: { targetId: 'enemy-1' }
    })

    expect(onInputReceived).toHaveBeenCalledWith('peer-a', 4, {
      type: 'attack',
      payload: { targetId: 'enemy-1' }
    })

    const inputs = lockstepManager.getInputsForTick(4)
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toMatchObject({
      peerId: 'peer-a',
      tick: 4,
      type: 'attack'
    })

    const peerState = lockstepManager.getPeerStates().find(peer => peer.peerId === 'peer-a')
    expect(peerState.lastReceivedTick).toBe(4)
  })

  it('[U02390] advances ticks, syncs RNG, and broadcasts hashes on interval', () => {
    const broadcastHash = vi.fn()
    const onTickAdvanced = vi.fn()

    lockstepManager.setOnBroadcastHash(broadcastHash)
    lockstepManager.setOnTickAdvanced(onTickAdvanced)

    lockstepManager.enable()
    lockstepManager._currentTick = LOCKSTEP_CONFIG.HASH_EXCHANGE_INTERVAL - 1
    lockstepManager._lastHashExchangeTick = 0
    lockstepManager._accumulator = MS_PER_TICK
    lockstepManager._lastTickTime = 0

    // Set peer as having received inputs so tick can advance
    const peerState = lockstepManager._peers.get('peer-a')
    peerState.lastReceivedTick = LOCKSTEP_CONFIG.HASH_EXCHANGE_INTERVAL - 1

    const inputs = lockstepManager.update(MS_PER_TICK)

    expect(inputs).toEqual([])
    expect(syncRNGForTick).toHaveBeenCalledWith(LOCKSTEP_CONFIG.HASH_EXCHANGE_INTERVAL - 1)
    expect(computeStateHash).toHaveBeenCalledWith(gameState, LOCKSTEP_CONFIG.HASH_EXCHANGE_INTERVAL)
    expect(broadcastHash).toHaveBeenCalledWith(LOCKSTEP_CONFIG.HASH_EXCHANGE_INTERVAL, 'hash-0')
    expect(onTickAdvanced).toHaveBeenCalledWith(LOCKSTEP_CONFIG.HASH_EXCHANGE_INTERVAL)
    expect(deterministicRNG.getState).toHaveBeenCalled()
  })

  it('[U02391] waits for lagging peers before advancing ticks', () => {
    lockstepManager.enable()
    lockstepManager._currentTick = 5
    lockstepManager._accumulator = MS_PER_TICK
    lockstepManager._lastTickTime = 0

    const peerState = lockstepManager._peers.get('peer-a')
    peerState.lastReceivedTick = 1

    const inputs = lockstepManager.update(MS_PER_TICK)

    expect(inputs).toEqual([])
    expect(lockstepManager.getCurrentTick()).toBe(5)
    expect(syncRNGForTick).not.toHaveBeenCalled()
  })

  it('[U02392] flags desyncs and clears them when hashes match', () => {
    const onDesyncDetected = vi.fn()
    lockstepManager.setOnDesyncDetected(onDesyncDetected)

    lockstepManager._pendingHashComparisons.set(10, {
      localHash: 'local-hash',
      peerHashes: new Map(),
      tick: 10
    })

    compareHashes.mockReturnValueOnce(false)
    lockstepManager.receiveRemoteHash('peer-a', 10, 'remote-hash')

    expect(onDesyncDetected).toHaveBeenCalledWith(10, 'peer-a', 'local-hash', 'remote-hash')

    let peerState = lockstepManager.getPeerStates().find(peer => peer.peerId === 'peer-a')
    expect(peerState.isDesynced).toBe(true)

    lockstepManager._pendingHashComparisons.set(11, {
      localHash: 'match-hash',
      peerHashes: new Map(),
      tick: 11
    })

    compareHashes.mockReturnValueOnce(true)
    lockstepManager.receiveRemoteHash('peer-a', 11, 'match-hash')

    peerState = lockstepManager.getPeerStates().find(peer => peer.peerId === 'peer-a')
    expect(peerState.isDesynced).toBe(false)
    expect(peerState.lastConfirmedTick).toBe(11)
  })

  it('[U02393] rolls back to a saved snapshot when available', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(200)

    lockstepManager._currentTick = 2
    lockstepManager._saveStateSnapshot()
    lockstepManager._currentTick = 5

    expect(lockstepManager.rollbackToTick(2)).toBe(true)
    expect(deterministicRNG.setState).toHaveBeenCalledWith({
      seed: 1,
      callCount: 0,
      enabled: true
    })
    expect(lockstepManager.getCurrentTick()).toBe(2)

    expect(lockstepManager.rollbackToTick(999)).toBe(false)

    nowSpy.mockRestore()
  })

  it('[U02394] adds/removes peers and tracks connection state', () => {
    lockstepManager.addPeer('peer-b')
    lockstepManager.addPeer('peer-b')

    let peerStates = lockstepManager.getPeerStates()
    expect(peerStates.some(peer => peer.peerId === 'peer-b')).toBe(true)

    lockstepManager.peerDisconnected('peer-b')
    peerStates = lockstepManager.getPeerStates()
    expect(peerStates.find(peer => peer.peerId === 'peer-b').isConnected).toBe(false)

    lockstepManager.peerReconnected('peer-b')
    peerStates = lockstepManager.getPeerStates()
    expect(peerStates.find(peer => peer.peerId === 'peer-b').isConnected).toBe(true)

    lockstepManager.removePeer('peer-b')
    peerStates = lockstepManager.getPeerStates()
    expect(peerStates.some(peer => peer.peerId === 'peer-b')).toBe(false)
  })

  it('[U02395] ignores remote input from unknown peers', () => {
    lockstepManager.receiveRemoteInput('unknown-peer', 5, { type: 'noop' })
    const inputs = lockstepManager.getInputsForTick(5)
    expect(inputs).toEqual([])
  })

  it('[U02396] advances ticks in single-player sessions', () => {
    lockstepManager._peers.clear()
    lockstepManager.enable()
    lockstepManager._currentTick = 0
    lockstepManager._accumulator = 0
    // Set lastTickTime to current timestamp so elapsed time equals exactly MS_PER_TICK
    lockstepManager._lastTickTime = 0

    // Call update with timestamp that creates exactly MS_PER_TICK elapsed time
    lockstepManager.update(MS_PER_TICK)

    // With 0 accumulator + MS_PER_TICK elapsed = 1 tick advance
    expect(lockstepManager.getCurrentTick()).toBe(1)
    expect(syncRNGForTick).toHaveBeenCalledWith(0)
  })
})
