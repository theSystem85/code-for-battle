import { afterEach, describe, expect, it, vi } from 'vitest'

const blobs = new Map()

vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(async() => ({
    async get(key) {
      return blobs.has(key) ? blobs.get(key) : null
    },
    async setJSON(key, value) {
      blobs.set(key, value)
    },
    async list({ prefix }) {
      return {
        blobs: [...blobs.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key }))
      }
    }
  }))
}))

import handler from '../../netlify/functions/api.js'

function request(method, path, body) {
  return new Request(`https://code-for-battle.netlify.app${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
}

describe('signalling API', () => {
  afterEach(() => {
    blobs.clear()
    delete globalThis.Netlify
  })

  it('keeps concurrent ICE candidates and reports them with the offer', async() => {
    const logs = []
    const spy = vi.spyOn(console, 'log').mockImplementation((line) => logs.push(String(line)))
    const offer = await handler(request('POST', '/api/signalling/offer', {
      inviteToken: 'lobby-token-aaaa',
      alias: 'galina',
      peerId: 'peer-1',
      offer: JSON.stringify({ type: 'offer', sdp: 'v=0' }),
      offerRevision: 1
    }))
    expect(offer.status).toBe(200)

    const hostLine = 'candidate:1 1 udp 1 192.168.0.2 9 typ host'
    const relayLine = 'candidate:2 1 udp 1 203.0.113.4 3478 typ relay'
    await Promise.all([
      handler(request('POST', '/api/signalling/candidate', {
        inviteToken: 'lobby-token-aaaa',
        peerId: 'peer-1',
        alias: 'galina',
        origin: 'peer',
        candidate: JSON.stringify({ candidate: hostLine, sdpMid: '0', sdpMLineIndex: 0 })
      })),
      handler(request('POST', '/api/signalling/candidate', {
        inviteToken: 'lobby-token-aaaa',
        peerId: 'peer-1',
        alias: 'galina',
        origin: 'host',
        candidate: JSON.stringify({ candidate: relayLine, sdpMid: '0', sdpMLineIndex: 0 })
      }))
    ])

    const pending = await handler(request('GET', '/api/signalling/pending/lobby-token-aaaa'))
    const sessions = await pending.json()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].alias).toBe('galina')
    expect(sessions[0].offerRevision).toBe(1)
    expect(sessions[0].candidates).toHaveLength(2)
    expect(sessions[0].candidates.map((entry) => entry.origin).sort()).toEqual(['host', 'peer'])
    const logged = logs.join('\n')
    expect(logged).toContain('"event":"offer"')
    expect(logged).toContain('"event":"candidate"')
    expect(logged).toContain('"event":"pending"')
    expect(logged).not.toContain('galina')
    expect(logged).not.toContain('192.168.0.2')
    expect(logged).not.toContain('203.0.113.4')
    spy.mockRestore()
  })

  it('returns STUN-only config and does not log a TURN secret', async() => {
    const logs = []
    const spy = vi.spyOn(console, 'log').mockImplementation((line) => logs.push(String(line)))
    globalThis.Netlify = {
      env: {
        get(name) {
          if (name === 'TURN_URLS') return 'turns:turn.example.com:443?transport=tcp'
          if (name === 'TURN_SECRET') return 'do-not-log-this-secret'
          return ''
        }
      }
    }

    const response = await handler(request('GET', '/api/signalling/ice-servers'))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.turnConfigured).toBe(true)
    expect(payload.credentialMode).toBe('ephemeral')
    expect(payload.iceServers[1].username).toMatch(/:cfb$/)
    expect(logs.join('\n')).not.toContain('do-not-log-this-secret')
    expect(logs.join('\n')).not.toContain(payload.iceServers[1].credential)
    spy.mockRestore()
  })

  it('wires TURN from ICE_SERVERS without logging the credential', async() => {
    const logs = []
    const spy = vi.spyOn(console, 'log').mockImplementation((line) => logs.push(String(line)))
    globalThis.Netlify = {
      env: {
        get(name) {
          if (name === 'ICE_SERVERS') {
            return JSON.stringify([{
              urls: 'turns:turn.example.com:443?transport=tcp',
              username: 'metered-user',
              credential: 'metered-do-not-log'
            }])
          }
          return ''
        }
      }
    }

    const response = await handler(request('GET', '/api/signalling/ice-servers'))
    const payload = await response.json()
    expect(payload.turnConfigured).toBe(true)
    expect(payload.credentialMode).toBe('ice-servers')
    expect(payload.iceServers.some((server) => server.credential === 'metered-do-not-log')).toBe(true)
    expect(logs.join('\n')).not.toContain('metered-do-not-log')
    expect(logs.join('\n')).not.toContain('metered-user')
    spy.mockRestore()
  })

  it('echoes the answer revision so an ICE restart can ignore a stale answer', async() => {
    const logs = []
    const spy = vi.spyOn(console, 'log').mockImplementation((line) => logs.push(String(line)))
    await handler(request('POST', '/api/signalling/offer', {
      inviteToken: 'lobby-token-bbbb',
      alias: 'max',
      peerId: 'peer-9',
      offer: JSON.stringify({ type: 'offer', sdp: 'first' }),
      offerRevision: 2
    }))
    await handler(request('POST', '/api/signalling/answer', {
      inviteToken: 'lobby-token-bbbb',
      peerId: 'peer-9',
      answer: JSON.stringify({ type: 'answer', sdp: 'reply' }),
      offerRevision: 2
    }))

    const response = await handler(request('GET', '/api/signalling/session/lobby-token-bbbb/peer-9'))
    const payload = await response.json()
    expect(payload.answerRevision).toBe(2)
    expect(payload.offerRevision).toBe(2)
    expect(logs.join('\n')).not.toContain('max')
    spy.mockRestore()
  })
})
