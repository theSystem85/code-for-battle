import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CLAIM_LUA,
  PRESENCE_LUA,
  PRESENCE_STALE_MS,
  RATE_LIMIT_MAX,
  adaptNetlifyBlobStore,
  applyPresence,
  blobsClaim,
  blobsPresence,
  claimOpenHost,
  claimPipeline,
  createMemoryStatsDb,
  handleMultiplayerStatsRequest,
  readRuntimeRedisEnv,
  interpretClaimEval,
  interpretPresenceEval,
  parsePresenceBody,
  presencePipeline,
  redisClaim,
  redisPresence,
  summarizePresenceCounts
} from '../../src/network/multiplayerStats.js'

const NOW = 1_700_000_000_000

function request(path, body) {
  return new Request(`https://code-for-battle.netlify.app${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function createBlobStore() {
  const blobs = new Map()
  return {
    blobs,
    async get(key) {
      return blobs.has(key) ? blobs.get(key) : null
    },
    async set(key, value, options = {}) {
      if (options.onlyIfNew && blobs.has(key)) return { modified: false }
      blobs.set(key, value)
      return { modified: true }
    },
    async delete(key) {
      blobs.delete(key)
    },
    async list(prefix) {
      return [...blobs.keys()].filter(key => key.startsWith(prefix))
    }
  }
}

describe('multiplayer stats server', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects invalid presence input and ignores personal fields', () => {
    expect(parsePresenceBody(null).error).toBe('invalid_request')
    expect(parsePresenceBody({ sessionId: 'short', status: 'menu' }).error).toBe('invalid_request')
    expect(parsePresenceBody({ sessionId: 'session-1234', status: 'asleep' }).error).toBe('invalid_request')
    expect(parsePresenceBody({
      sessionId: 'session-1234',
      status: 'menu',
      alias: 'Ada Lovelace',
      email: 'ada@example.com'
    })).toEqual({
      sessionId: 'session-1234',
      status: 'menu',
      openInviteToken: null
    })
  })

  it('counts fresh sessions, moves status, and drops entries older than 90s', () => {
    const db = createMemoryStatsDb()
    const first = applyPresence(db, { sessionId: 'session-aaaa', status: 'menu', openInviteToken: null, now: NOW })
    expect(first.playing).toBe(1)
    expect(first.menu).toBe(1)
    expect(first.onlineMultiplayer).toBe(0)

    const second = applyPresence(db, {
      sessionId: 'session-bbbb',
      status: 'mp-host',
      openInviteToken: null,
      now: NOW + 1000
    })
    expect(second.playing).toBe(2)
    expect(second.onlineMultiplayer).toBe(1)
    expect(second.mpHost).toBe(1)

    const moved = applyPresence(db, {
      sessionId: 'session-aaaa',
      status: 'single-player',
      openInviteToken: null,
      now: NOW + 2000
    })
    expect(moved.menu).toBe(0)
    expect(moved.singlePlayer).toBe(1)
    expect(moved.playing).toBe(2)

    const later = applyPresence(db, {
      sessionId: 'session-cccc',
      status: 'mp-client',
      openInviteToken: null,
      now: NOW + PRESENCE_STALE_MS + 5000
    })
    expect(later.playing).toBe(1)
    expect(later.mpClient).toBe(1)
    expect(later.onlineMultiplayer).toBe(1)
    expect(JSON.stringify(db)).not.toContain('Ada')
  })

  it('rate-limits a session and expires idle keys', () => {
    const db = createMemoryStatsDb()
    for (let i = 0; i < RATE_LIMIT_MAX; i += 1) {
      const outcome = applyPresence(db, {
        sessionId: 'session-rate',
        status: 'menu',
        openInviteToken: null,
        now: NOW + i
      })
      expect(outcome.rateLimited).toBe(false)
    }
    const blocked = applyPresence(db, {
      sessionId: 'session-rate',
      status: 'single-player',
      openInviteToken: null,
      now: NOW + 20
    })
    expect(blocked.rateLimited).toBe(true)
    expect(db.sets.get('cfb:presence:menu').has('session-rate')).toBe(true)
    expect(db.sets.get('cfb:presence:single-player')?.has('session-rate')).toBeFalsy()

    const reset = applyPresence(db, {
      sessionId: 'session-rate',
      status: 'single-player',
      openInviteToken: null,
      now: NOW + 60_000
    })
    expect(reset.rateLimited).toBe(false)
    expect(reset.singlePlayer).toBe(1)

    db.keyExpiry.set('cfb:presence:single-player', NOW)
    const afterExpiry = applyPresence(db, {
      sessionId: 'session-next',
      status: 'menu',
      openInviteToken: null,
      now: NOW + 200_000
    })
    expect(afterExpiry.playing).toBe(1)
    expect(afterExpiry.menu).toBe(1)
    expect(afterExpiry.singlePlayer).toBe(0)
  })

  it('claims the oldest other host, skips self and stale hosts, and refuses a second claim', () => {
    const db = createMemoryStatsDb()
    applyPresence(db, {
      sessionId: 'host-self00',
      status: 'mp-host',
      openInviteToken: 'instance-player2-1000',
      now: NOW
    })
    applyPresence(db, {
      sessionId: 'host-other1',
      status: 'mp-host',
      openInviteToken: 'instance-player3-2000',
      now: NOW + 1000
    })
    applyPresence(db, {
      sessionId: 'host-stale1',
      status: 'mp-host',
      openInviteToken: 'instance-player4-3000',
      now: NOW - PRESENCE_STALE_MS - 1000
    })

    const own = claimOpenHost(db, { sessionId: 'host-self00', now: NOW + 2000 })
    expect(own.inviteToken).toBe('instance-player3-2000')
    expect(own.hostSessionId).toBe('host-other1')
    expect(db.sets.get('cfb:open-hosts').has('host-self00')).toBe(true)

    const again = claimOpenHost(db, { sessionId: 'joiner-2222', now: NOW + 3000 })
    expect(again.inviteToken).toBe('instance-player2-1000')

    const none = claimOpenHost(db, { sessionId: 'joiner-3333', now: NOW + 4000 })
    expect(none.inviteToken).toBeNull()

    const relisted = applyPresence(db, {
      sessionId: 'host-other1',
      status: 'mp-host',
      openInviteToken: 'instance-player3-2000',
      now: NOW + 5000
    })
    expect(relisted.openSlot).toBe('filled')
    expect(db.sets.get('cfb:open-hosts').has('host-other1')).toBe(false)
  })

  it('uses one pipeline EVAL that updates sets and pops an open host', () => {
    expect(PRESENCE_LUA).toContain('ZADD')
    expect(PRESENCE_LUA).toContain('ZREM')
    expect(PRESENCE_LUA).toContain('ZREMRANGEBYSCORE')
    expect(PRESENCE_LUA).toContain('ZCARD')
    expect(PRESENCE_LUA).toContain('EXPIRE')
    expect(CLAIM_LUA).toContain('ZPOPMIN')
    const presenceCommands = presencePipeline({
      sessionId: 'session-1234',
      status: 'menu',
      openInviteToken: null,
      now: NOW
    })
    const claimCommands = claimPipeline({ sessionId: 'session-1234', now: NOW })
    expect(presenceCommands).toHaveLength(1)
    expect(presenceCommands[0][0]).toBe('EVAL')
    expect(claimCommands).toHaveLength(1)
    expect(claimCommands[0][0]).toBe('EVAL')

    const fetchImpl = vi.fn(async(_url, options) => {
      const commands = JSON.parse(options.body)
      expect(commands).toHaveLength(1)
      expect(commands[0][0]).toBe('EVAL')
      const script = commands[0][1]
      const result = script.includes('ZPOPMIN')
        ? ['host-other1', 'instance-player2-1000']
        : [0, 1, 1, 1, 0, 'listed']
      return new Response(JSON.stringify([{ result }]), { status: 200 })
    })
    const redis = { url: 'https://example.upstash.io', token: 'secret-token' }
    return redisPresence(fetchImpl, redis, {
      sessionId: 'session-1234',
      status: 'mp-host',
      openInviteToken: 'instance-player2-1000',
      now: NOW
    }).then(async presence => {
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(fetchImpl.mock.calls[0][0]).toBe('https://example.upstash.io/pipeline')
      expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer secret-token')
      expect(presence.storage).toBe('redis')
      expect(presence.playing).toBe(3)
      expect(presence.onlineMultiplayer).toBe(2)
      expect(presence.openSlot).toBe('listed')
      const claim = await redisClaim(fetchImpl, redis, { sessionId: 'joiner-2222', now: NOW })
      expect(claim.inviteToken).toBe('instance-player2-1000')
      expect(fetchImpl).toHaveBeenCalledTimes(2)
    })
  })

  it('interprets a rate-limited eval result', () => {
    expect(interpretPresenceEval(['rate']).rateLimited).toBe(true)
    expect(interpretClaimEval(['rate']).rateLimited).toBe(true)
    expect(summarizePresenceCounts({ menu: 2, 'mp-host': 1, 'mp-client': 1 }).onlineMultiplayer).toBe(2)
  })

  it('falls back to blobs with approximate counts and onlyIfNew claims', async() => {
    const store = createBlobStore()
    const host = await blobsPresence(store, {
      sessionId: 'host-session',
      status: 'mp-host',
      openInviteToken: 'instance-player2-1000',
      now: NOW
    })
    const guest = await blobsPresence(store, {
      sessionId: 'guest-session',
      status: 'single-player',
      openInviteToken: null,
      now: NOW + 10
    })
    expect(host.storage).toBe('blobs')
    expect(guest.playing).toBe(2)
    expect(guest.onlineMultiplayer).toBe(1)
    expect(guest.singlePlayer).toBe(1)
    expect(JSON.stringify([...store.blobs.values()])).not.toContain('Ada Lovelace')

    const stale = await blobsPresence(store, {
      sessionId: 'old-session1',
      status: 'menu',
      openInviteToken: null,
      now: NOW - PRESENCE_STALE_MS - 50
    })
    expect(stale.menu).toBe(1)
    const swept = await blobsPresence(store, {
      sessionId: 'guest-session',
      status: 'single-player',
      openInviteToken: null,
      now: NOW + 100
    })
    expect(swept.menu).toBe(0)
    expect(swept.playing).toBe(2)

    let writes = 0
    const racing = createBlobStore()
    await blobsPresence(racing, {
      sessionId: 'host-session',
      status: 'mp-host',
      openInviteToken: 'instance-player2-1000',
      now: NOW
    })
    const originalSet = racing.set.bind(racing)
    racing.set = async(key, value, options) => {
      if (options?.onlyIfNew) {
        writes += 1
        if (writes > 1) return { modified: false }
      }
      return originalSet(key, value, options)
    }
    const [first, second] = await Promise.all([
      blobsClaim(racing, { sessionId: 'joiner-aaaa', now: NOW + 5 }),
      blobsClaim(racing, { sessionId: 'joiner-bbbb', now: NOW + 5 })
    ])
    const tokens = [first.inviteToken, second.inviteToken].filter(Boolean)
    expect(tokens).toEqual(['instance-player2-1000'])

    const filled = await blobsPresence(racing, {
      sessionId: 'host-session',
      status: 'mp-host',
      openInviteToken: 'instance-player2-1000',
      now: NOW + 20
    })
    expect(filled.openSlot).toBe('filled')
  })

  it('serves presence from blobs through the request handler when redis is unset', async() => {
    const store = createBlobStore()
    const response = await handleMultiplayerStatsRequest(request('/api/presence', {
      sessionId: 'session-1234',
      status: 'looking-for-match',
      alias: 'Ada Lovelace'
    }), {
      env: {},
      blobs: store,
      now: () => NOW
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.lookingForMatch).toBe(1)
    expect(body.playing).toBe(1)
    expect(body.storage).toBe('blobs')
    expect(body.backend).toBe('blobs')
    expect(body.redisConfigured).toBe(false)
    expect(JSON.stringify([...store.blobs.values()])).not.toContain('Ada Lovelace')

    const missing = await handleMultiplayerStatsRequest(request('/api/presence', {
      sessionId: 'bad',
      status: 'menu'
    }), { env: {}, blobs: store, now: () => NOW })
    expect(missing.status).toBe(400)
  })

  it('reports backend redis when Upstash answers the pipeline', async() => {
    const fetchImpl = vi.fn(async() => new Response(JSON.stringify([
      { result: [1, 0, 0, 0, 0, 'closed'] }
    ]), { status: 200 }))
    const blobs = createBlobStore()
    const response = await handleMultiplayerStatsRequest(request('/api/presence', {
      sessionId: 'session-1234',
      status: 'menu'
    }), {
      env: {
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'token'
      },
      fetchImpl,
      blobs,
      now: () => NOW
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.backend).toBe('redis')
    expect(body.storage).toBe('redis')
    expect(body.redisConfigured).toBe(true)
    expect(body.playing).toBe(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(blobs.blobs.size).toBe(0)
  })

  it('omits store debug fields when the deploy context is production', async() => {
    const fetchImpl = vi.fn(async() => new Response(JSON.stringify([
      { result: [1, 0, 0, 0, 0, 'closed'] }
    ]), { status: 200 }))
    const response = await handleMultiplayerStatsRequest(request('/api/presence', {
      sessionId: 'session-1234',
      status: 'menu'
    }), {
      env: {
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'token',
        CONTEXT: 'production'
      },
      fetchImpl,
      now: () => NOW,
      handler: 'edge'
    })
    const body = await response.json()
    expect(body.playing).toBe(1)
    expect(body.backend).toBeUndefined()
    expect(body.storage).toBeUndefined()
    expect(body.redisConfigured).toBeUndefined()
    expect(body.handler).toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('keeps store debug fields on deploy previews', async() => {
    const response = await handleMultiplayerStatsRequest(request('/api/presence', {
      sessionId: 'session-1234',
      status: 'menu'
    }), {
      env: { CONTEXT: 'deploy-preview' },
      blobs: createBlobStore(),
      now: () => NOW,
      handler: 'function'
    })
    const body = await response.json()
    expect(body.backend).toBe('blobs')
    expect(body.redisConfigured).toBe(false)
    expect(body.handler).toBe('function')
  })

  it('reads a secret Upstash token from Netlify.env when process.env is empty', async() => {
    const previous = globalThis.Netlify
    globalThis.Netlify = {
      env: {
        get(key) {
          if (key === 'UPSTASH_REDIS_REST_TOKEN') return 'secret-token'
          throw new Error(`missing ${key}`)
        },
        toObject() {
          return { UPSTASH_REDIS_REST_URL: 'https://example.upstash.io' }
        }
      }
    }
    try {
      expect(readRuntimeRedisEnv({})).toEqual({
        url: 'https://example.upstash.io',
        token: 'secret-token'
      })
      const fetchImpl = vi.fn(async() => new Response(JSON.stringify([
        { result: [1, 0, 0, 0, 0, 'closed'] }
      ]), { status: 200 }))
      const response = await handleMultiplayerStatsRequest(request('/api/presence', {
        sessionId: 'session-1234',
        status: 'menu'
      }), {
        env: {},
        fetchImpl,
        blobs: createBlobStore(),
        now: () => NOW,
        handler: 'edge'
      })
      const body = await response.json()
      expect(body.backend).toBe('redis')
      expect(body.handler).toBe('edge')
      expect(body.redisConfigured).toBe(true)
    } finally {
      if (previous === undefined) delete globalThis.Netlify
      else globalThis.Netlify = previous
    }
  })

  it('adapts Netlify blob conditional writes', async() => {
    const saved = new Map()
    const adapted = adaptNetlifyBlobStore({
      async get(key) {
        return saved.get(key) || null
      },
      async setJSON(key, value, options) {
        if (options?.onlyIfNew && saved.has(key)) return { modified: false }
        saved.set(key, value)
        return { modified: true }
      },
      async delete(key) {
        saved.delete(key)
      },
      async list({ prefix }) {
        return { blobs: [...saved.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }
      }
    })
    expect((await adapted.set('claim', { at: 1 }, { onlyIfNew: true })).modified).toBe(true)
    expect((await adapted.set('claim', { at: 2 }, { onlyIfNew: true })).modified).toBe(false)
    expect(await adapted.list('cl')).toEqual(['claim'])
  })
})
