import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../setup.js'

describe('signalling.js', () => {
  let originalFetch

  beforeEach(() => {
    vi.clearAllMocks()
    originalFetch = globalThis.fetch
    // Create a mock fetch
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.resetModules()
  })

  describe('STUN_HOST detection', () => {
    it('exports STUN_HOST constant', async() => {
      const { STUN_HOST } = await import('../../src/network/signalling.js')
      // Default should be empty string for relative URLs
      expect(typeof STUN_HOST).toBe('string')
    })
  })

  describe('postOffer', () => {
    it('sends a POST request to the offer endpoint', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const { postOffer } = await import('../../src/network/signalling.js')
      const payload = { sdp: 'test-sdp', peerId: 'peer1' }
      const result = await postOffer(payload)

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/signalling/offer'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      )
      expect(result).toEqual({ success: true })
    })

    it('throws error when response is not ok', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      })

      const { postOffer } = await import('../../src/network/signalling.js')
      await expect(postOffer({})).rejects.toThrow('Signalling /signalling/offer failed: 500')
    })

    it('returns empty object when JSON parsing fails', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON'))
      })

      const { postOffer } = await import('../../src/network/signalling.js')
      const result = await postOffer({})
      expect(result).toEqual({})
    })
  })

  describe('postAnswer', () => {
    it('sends a POST request to the answer endpoint', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ answerId: 'a123' })
      })

      const { postAnswer } = await import('../../src/network/signalling.js')
      const payload = { sdp: 'answer-sdp', targetPeerId: 'peer2' }
      const result = await postAnswer(payload)

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/signalling/answer'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload)
        })
      )
      expect(result).toEqual({ answerId: 'a123' })
    })

    it('throws error on server failure', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403
      })

      const { postAnswer } = await import('../../src/network/signalling.js')
      await expect(postAnswer({})).rejects.toThrow('Signalling /signalling/answer failed: 403')
    })
  })

  describe('postCandidate', () => {
    it('sends a POST request to the candidate endpoint', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ received: true })
      })

      const { postCandidate } = await import('../../src/network/signalling.js')
      const payload = {
        candidate: { candidate: 'ice-candidate-data' },
        peerId: 'peer1'
      }
      const result = await postCandidate(payload)

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/signalling/candidate'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload)
        })
      )
      expect(result).toEqual({ received: true })
    })

    it('throws error on network failure', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502
      })

      const { postCandidate } = await import('../../src/network/signalling.js')
      await expect(postCandidate({})).rejects.toThrow('Signalling /signalling/candidate failed: 502')
    })
  })

  describe('fetchPendingSessions', () => {
    it('throws error when inviteToken is missing', async() => {
      const { fetchPendingSessions } = await import('../../src/network/signalling.js')
      expect(() => fetchPendingSessions()).toThrow('Invite token is required')
      expect(() => fetchPendingSessions(null)).toThrow('Invite token is required')
      expect(() => fetchPendingSessions('')).toThrow('Invite token is required')
    })

    it('fetches pending sessions with cache-busting timestamp', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ peerId: 'peer1' }])
      })

      const { fetchPendingSessions } = await import('../../src/network/signalling.js')
      const result = await fetchPendingSessions('invite-token-123')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/signalling\/pending\/invite-token-123\?_t=\d+/),
        { cache: 'no-store' }
      )
      expect(result).toEqual([{ peerId: 'peer1' }])
    })

    it('URL-encodes the invite token', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([])
      })

      const { fetchPendingSessions } = await import('../../src/network/signalling.js')
      await fetchPendingSessions('token with spaces')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('token%20with%20spaces'),
        expect.any(Object)
      )
    })

    it('throws error when fetch fails', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      })

      const { fetchPendingSessions } = await import('../../src/network/signalling.js')
      await expect(fetchPendingSessions('token')).rejects.toThrow('Failed to fetch pending sessions (404)')
    })

    it('returns empty array when JSON parsing fails', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON'))
      })

      const { fetchPendingSessions } = await import('../../src/network/signalling.js')
      const result = await fetchPendingSessions('token')
      expect(result).toEqual([])
    })
  })

  describe('fetchSessionStatus', () => {
    it('throws error when inviteToken is missing', async() => {
      const { fetchSessionStatus } = await import('../../src/network/signalling.js')
      await expect(fetchSessionStatus()).rejects.toThrow('Invite token and peerId are required')
      await expect(fetchSessionStatus(null, 'peer1')).rejects.toThrow('Invite token and peerId are required')
    })

    it('throws error when peerId is missing', async() => {
      const { fetchSessionStatus } = await import('../../src/network/signalling.js')
      await expect(fetchSessionStatus('token')).rejects.toThrow('Invite token and peerId are required')
      await expect(fetchSessionStatus('token', '')).rejects.toThrow('Invite token and peerId are required')
    })

    it('fetches session status with cache-busting timestamp', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'pending', offer: 'sdp-data' })
      })

      const { fetchSessionStatus } = await import('../../src/network/signalling.js')
      const result = await fetchSessionStatus('token123', 'peerABC')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/signalling\/session\/token123\/peerABC\?_t=\d+/),
        { cache: 'no-store' }
      )
      expect(result).toEqual({ status: 'pending', offer: 'sdp-data' })
    })

    it('URL-encodes both inviteToken and peerId', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({})
      })

      const { fetchSessionStatus } = await import('../../src/network/signalling.js')
      await fetchSessionStatus('token with space', 'peer/with/slashes')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('token%20with%20space'),
        expect.any(Object)
      )
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('peer%2Fwith%2Fslashes'),
        expect.any(Object)
      )
    })

    it('throws error when fetch fails', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      })

      const { fetchSessionStatus } = await import('../../src/network/signalling.js')
      await expect(fetchSessionStatus('token', 'peer')).rejects.toThrow('Failed to retrieve signalling session (500)')
    })

    it('returns empty object when JSON parsing fails', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON'))
      })

      const { fetchSessionStatus } = await import('../../src/network/signalling.js')
      const result = await fetchSessionStatus('token', 'peer')
      expect(result).toEqual({})
    })
  })

  describe('fetchIceServers', () => {
    it('fetches ICE server config without caching', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ turnConfigured: false, iceServers: [] })
      })

      const { fetchIceServers } = await import('../../src/network/signalling.js')
      const result = await fetchIceServers()

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/signalling\/ice-servers\?_t=\d+/),
        { cache: 'no-store' }
      )
      expect(result).toEqual({ turnConfigured: false, iceServers: [] })
    })

    it('throws when the ICE config request fails', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503
      })

      const { fetchIceServers } = await import('../../src/network/signalling.js')
      await expect(fetchIceServers()).rejects.toThrow('Failed to fetch ICE servers (503)')
    })
  })

  describe('generateSessionKey', () => {
    it('combines inviteToken and peerId with a hyphen', async() => {
      const { generateSessionKey } = await import('../../src/network/signalling.js')
      expect(generateSessionKey('token123', 'peerABC')).toBe('token123-peerABC')
    })

    it('handles empty strings', async() => {
      const { generateSessionKey } = await import('../../src/network/signalling.js')
      expect(generateSessionKey('', '')).toBe('-')
      expect(generateSessionKey('token', '')).toBe('token-')
      expect(generateSessionKey('', 'peer')).toBe('-peer')
    })

    it('preserves complex token and peer formats', async() => {
      const { generateSessionKey } = await import('../../src/network/signalling.js')
      const token = 'game-123-player1-1234567890'
      const peerId = 'uuid-peer-id-value'
      expect(generateSessionKey(token, peerId)).toBe(`${token}-${peerId}`)
    })

    it('produces consistent keys for same inputs', async() => {
      const { generateSessionKey } = await import('../../src/network/signalling.js')
      const key1 = generateSessionKey('token', 'peer')
      const key2 = generateSessionKey('token', 'peer')
      expect(key1).toBe(key2)
    })

    it('produces unique keys for different inputs', async() => {
      const { generateSessionKey } = await import('../../src/network/signalling.js')
      const key1 = generateSessionKey('token1', 'peer1')
      const key2 = generateSessionKey('token2', 'peer2')
      const key3 = generateSessionKey('token1', 'peer2')
      expect(key1).not.toBe(key2)
      expect(key1).not.toBe(key3)
      expect(key2).not.toBe(key3)
    })
  })

  describe('URL construction', () => {
    it('builds API URLs correctly with empty STUN_HOST', async() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({})
      })

      const { postOffer, STUN_HOST } = await import('../../src/network/signalling.js')
      await postOffer({ test: true })

      // When STUN_HOST is empty, it should use relative /api URLs
      if (STUN_HOST === '') {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          '/api/signalling/offer',
          expect.any(Object)
        )
      }
    })
  })

  describe('error handling edge cases', () => {
    it('handles network errors in postOffer', async() => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const { postOffer } = await import('../../src/network/signalling.js')
      await expect(postOffer({})).rejects.toThrow('Network error')
    })

    it('handles network errors in fetchPendingSessions', async() => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const { fetchPendingSessions } = await import('../../src/network/signalling.js')
      await expect(fetchPendingSessions('token')).rejects.toThrow('Network error')
    })

    it('handles network errors in fetchSessionStatus', async() => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

      const { fetchSessionStatus } = await import('../../src/network/signalling.js')
      await expect(fetchSessionStatus('token', 'peer')).rejects.toThrow('Connection refused')
    })
  })
})
