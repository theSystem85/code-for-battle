export const PRESENCE_STATUSES = Object.freeze([
  'menu',
  'single-player',
  'mp-host',
  'mp-client',
  'looking-for-match'
])

export const PRESENCE_STALE_MS = 90_000
export const PRESENCE_KEY_TTL_MS = 180_000
export const OPEN_HOST_TTL_MS = 90_000
export const CLAIMED_TOKEN_TTL_MS = 600_000
export const RATE_LIMIT_MAX = 8
export const RATE_LIMIT_WINDOW_MS = 60_000

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,160}$/

const PRESENCE_KEY = 'cfb:presence:'
const OPEN_HOSTS_KEY = 'cfb:open-hosts'
const OPEN_TOKEN_KEY = 'cfb:open-token:'
const CLAIMED_KEY = 'cfb:claimed:'
const RATE_KEY = 'cfb:rl:'
const CLAIM_RATE_KEY = 'cfb:rl:claim:'

export const PRESENCE_LUA = `
local sessionId = ARGV[1]
local status = ARGV[2]
local now = tonumber(ARGV[3])
local staleBefore = tonumber(ARGV[4])
local rlMax = tonumber(ARGV[5])
local rlWindow = tonumber(ARGV[6])
local openToken = ARGV[7]
local rlKey = "cfb:rl:" .. sessionId
local hits = redis.call("INCR", rlKey)
if hits == 1 or redis.call("TTL", rlKey) < 0 then
  redis.call("EXPIRE", rlKey, rlWindow)
end
if hits > rlMax then
  return {"rate"}
end
local statuses = {"menu","single-player","mp-host","mp-client","looking-for-match"}
local counts = {}
for i, name in ipairs(statuses) do
  local key = "cfb:presence:" .. name
  if name == status then
    redis.call("ZADD", key, now, sessionId)
  else
    redis.call("ZREM", key, sessionId)
  end
  redis.call("ZREMRANGEBYSCORE", key, "-inf", staleBefore)
  redis.call("EXPIRE", key, 180)
  counts[i] = redis.call("ZCARD", key)
end
redis.call("ZREM", "cfb:open-hosts", sessionId)
redis.call("DEL", "cfb:open-token:" .. sessionId)
local openState = "closed"
if openToken ~= "" then
  local claimed = redis.call("GET", "cfb:claimed:" .. openToken)
  if claimed ~= false then
    openState = "filled"
  else
    redis.call("SET", "cfb:open-token:" .. sessionId, openToken, "EX", 90)
    redis.call("ZADD", "cfb:open-hosts", now, sessionId)
    redis.call("EXPIRE", "cfb:open-hosts", 180)
    openState = "listed"
  end
end
return {counts[1], counts[2], counts[3], counts[4], counts[5], openState}
`.trim()

export const CLAIM_LUA = `
local selfId = ARGV[1]
local now = tonumber(ARGV[2])
local staleBefore = tonumber(ARGV[3])
local rlMax = tonumber(ARGV[4])
local rlWindow = tonumber(ARGV[5])
local rlKey = "cfb:rl:claim:" .. selfId
local hits = redis.call("INCR", rlKey)
if hits == 1 or redis.call("TTL", rlKey) < 0 then
  redis.call("EXPIRE", rlKey, rlWindow)
end
if hits > rlMax then
  return {"rate"}
end
redis.call("ZREMRANGEBYSCORE", "cfb:open-hosts", "-inf", staleBefore)
local heldId = false
local heldScore = false
while true do
  local popped = redis.call("ZPOPMIN", "cfb:open-hosts")
  if popped[1] == nil then break end
  local id = popped[1]
  local score = popped[2]
  local token = redis.call("GET", "cfb:open-token:" .. id)
  if token == false then
    redis.call("DEL", "cfb:open-token:" .. id)
  elseif id == selfId then
    heldId = id
    heldScore = score
  else
    redis.call("DEL", "cfb:open-token:" .. id)
    redis.call("SET", "cfb:claimed:" .. token, "1", "EX", 600)
    if heldId ~= false then
      redis.call("ZADD", "cfb:open-hosts", heldScore, heldId)
    end
    return {id, token}
  end
end
if heldId ~= false then
  redis.call("ZADD", "cfb:open-hosts", heldScore, heldId)
end
return {}
`.trim()

const JSON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
}

function stringEnv(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function readEnvKey(bag, key) {
  try {
    if (!bag) return ''
    return stringEnv(bag[key])
  } catch {
    return ''
  }
}

function readNetlifyEnvKey(key) {
  const netlify = globalThis.Netlify
  if (!netlify || !netlify.env) return ''
  if (typeof netlify.env.get === 'function') {
    try {
      const value = stringEnv(netlify.env.get(key))
      if (value) return value
    } catch {
      // Unset keys throw. Keep going so toObject or another runtime can answer.
    }
  }
  if (typeof netlify.env.toObject === 'function') {
    try {
      return readEnvKey(netlify.env.toObject(), key)
    } catch {
      return ''
    }
  }
  return ''
}

function readDenoEnvKey(key) {
  const deno = globalThis['Deno']
  if (!deno || !deno.env || typeof deno.env.get !== 'function') return ''
  try {
    return stringEnv(deno.env.get(key))
  } catch {
    return ''
  }
}

export function readRedisEnv(env = {}) {
  const url = stringEnv(env.UPSTASH_REDIS_REST_URL).replace(/\/$/, '')
  const token = stringEnv(env.UPSTASH_REDIS_REST_TOKEN)
  if (!url || !token) return null
  return { url, token }
}

// Literal key reads. Netlify injects Functions-scoped values, including secrets,
// when the access is visible to the deploy. A dynamic name alone is not enough.
// Bracket access stays so a build-time inlined empty process.env.KEY cannot hide
// the runtime value.
export function readRuntimeRedisEnv(env = {}) {
  const proc = typeof process !== 'undefined' ? process.env : null
  return readRedisEnv({
    UPSTASH_REDIS_REST_URL: stringEnv(env.UPSTASH_REDIS_REST_URL)
      || readNetlifyEnvKey('UPSTASH_REDIS_REST_URL')
      || readDenoEnvKey('UPSTASH_REDIS_REST_URL')
      || readEnvKey(proc, 'UPSTASH_REDIS_REST_URL'),
    UPSTASH_REDIS_REST_TOKEN: stringEnv(env.UPSTASH_REDIS_REST_TOKEN)
      || readNetlifyEnvKey('UPSTASH_REDIS_REST_TOKEN')
      || readDenoEnvKey('UPSTASH_REDIS_REST_TOKEN')
      || readEnvKey(proc, 'UPSTASH_REDIS_REST_TOKEN')
  })
}

function deployContext(env = {}) {
  const proc = typeof process !== 'undefined' ? process.env : null
  return stringEnv(env.CONTEXT)
    || readNetlifyEnvKey('CONTEXT')
    || readDenoEnvKey('CONTEXT')
    || readEnvKey(proc, 'CONTEXT')
}

// Production responses stay free of store and handler names. Deploy previews,
// branch deploys, local netlify dev, and the in-memory helper keep them.
export function statsDebugEnabled(env = {}) {
  if (env.statsDebug === false) return false
  if (env.statsDebug === true) return true
  return deployContext(env) !== 'production'
}

export function statsRoute(pathname) {
  const path = String(pathname || '')
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/\.netlify\/functions\/multiplayer-stats/, '')
    .replace(/^\/api/, '') || '/'
  if (path === '/presence') return 'presence'
  if (path === '/quick-match') return 'quick-match'
  return null
}

export function parsePresenceBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'invalid_request' }
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const status = typeof body.status === 'string' ? body.status.trim() : ''
  if (!SESSION_ID_PATTERN.test(sessionId) || !PRESENCE_STATUSES.includes(status)) {
    return { error: 'invalid_request' }
  }
  let openInviteToken = null
  if (body.openInviteToken != null && body.openInviteToken !== '') {
    if (typeof body.openInviteToken !== 'string' || !INVITE_TOKEN_PATTERN.test(body.openInviteToken.trim())) {
      return { error: 'invalid_request' }
    }
    openInviteToken = body.openInviteToken.trim()
  }
  return { sessionId, status, openInviteToken }
}

export function parseClaimBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'invalid_request' }
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  if (!SESSION_ID_PATTERN.test(sessionId)) return { error: 'invalid_request' }
  return { sessionId }
}

export function summarizePresenceCounts(rawCounts) {
  const counts = {}
  PRESENCE_STATUSES.forEach(status => {
    counts[status] = Math.max(0, Number(rawCounts?.[status]) || 0)
  })
  const playing = PRESENCE_STATUSES.reduce((sum, status) => sum + counts[status], 0)
  return {
    playing,
    onlineMultiplayer: counts['mp-host'] + counts['mp-client'],
    lookingForMatch: counts['looking-for-match'],
    menu: counts.menu,
    singlePlayer: counts['single-player'],
    mpHost: counts['mp-host'],
    mpClient: counts['mp-client']
  }
}

export function createMemoryStatsDb() {
  return {
    sets: new Map(),
    strings: new Map(),
    counters: new Map(),
    keyExpiry: new Map()
  }
}

function zset(db, key) {
  let set = db.sets.get(key)
  if (!set) {
    set = new Map()
    db.sets.set(key, set)
  }
  return set
}

function purgeExpired(db, now) {
  for (const [key, expiresAt] of db.keyExpiry) {
    if (expiresAt <= now) {
      db.sets.delete(key)
      db.keyExpiry.delete(key)
    }
  }
  for (const [key, entry] of db.strings) {
    if (!entry || entry.expiresAt <= now) db.strings.delete(key)
  }
  for (const [key, entry] of db.counters) {
    if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) db.counters.delete(key)
  }
}

function touchCounter(db, key, now) {
  const current = db.counters.get(key)
  if (!current || now - current.windowStart >= RATE_LIMIT_WINDOW_MS) {
    db.counters.set(key, { count: 1, windowStart: now })
    return true
  }
  current.count += 1
  return current.count <= RATE_LIMIT_MAX
}

function sweepStale(set, staleBefore) {
  for (const [member, score] of set) {
    if (score < staleBefore) set.delete(member)
  }
}

export function applyPresence(db, input) {
  const now = input.now
  purgeExpired(db, now)
  if (!touchCounter(db, `${RATE_KEY}${input.sessionId}`, now)) {
    return { rateLimited: true }
  }
  const staleBefore = now - PRESENCE_STALE_MS
  for (const status of PRESENCE_STATUSES) {
    const key = `${PRESENCE_KEY}${status}`
    const set = zset(db, key)
    if (status === input.status) set.set(input.sessionId, now)
    else set.delete(input.sessionId)
    sweepStale(set, staleBefore)
    db.keyExpiry.set(key, now + PRESENCE_KEY_TTL_MS)
  }
  zset(db, OPEN_HOSTS_KEY).delete(input.sessionId)
  db.strings.delete(`${OPEN_TOKEN_KEY}${input.sessionId}`)
  let openSlot = 'closed'
  if (input.openInviteToken) {
    const claimed = db.strings.get(`${CLAIMED_KEY}${input.openInviteToken}`)
    if (claimed && claimed.expiresAt > now) {
      openSlot = 'filled'
    } else {
      db.strings.set(`${OPEN_TOKEN_KEY}${input.sessionId}`, {
        value: input.openInviteToken,
        expiresAt: now + OPEN_HOST_TTL_MS
      })
      zset(db, OPEN_HOSTS_KEY).set(input.sessionId, now)
      db.keyExpiry.set(OPEN_HOSTS_KEY, now + PRESENCE_KEY_TTL_MS)
      openSlot = 'listed'
    }
  }
  const raw = {}
  for (const status of PRESENCE_STATUSES) {
    raw[status] = zset(db, `${PRESENCE_KEY}${status}`).size
  }
  return {
    rateLimited: false,
    openSlot,
    storage: 'memory',
    ...summarizePresenceCounts(raw)
  }
}

export function claimOpenHost(db, input) {
  const now = input.now
  purgeExpired(db, now)
  if (!touchCounter(db, `${CLAIM_RATE_KEY}${input.sessionId}`, now)) {
    return { rateLimited: true }
  }
  const staleBefore = now - PRESENCE_STALE_MS
  const open = zset(db, OPEN_HOSTS_KEY)
  sweepStale(open, staleBefore)
  const ranked = [...open.entries()].sort((left, right) => left[1] - right[1])
  for (const [id] of ranked) {
    const tokenEntry = db.strings.get(`${OPEN_TOKEN_KEY}${id}`)
    const token = tokenEntry && tokenEntry.expiresAt > now ? tokenEntry.value : null
    if (!token) {
      open.delete(id)
      db.strings.delete(`${OPEN_TOKEN_KEY}${id}`)
      continue
    }
    if (id === input.sessionId) continue
    open.delete(id)
    db.strings.delete(`${OPEN_TOKEN_KEY}${id}`)
    db.strings.set(`${CLAIMED_KEY}${token}`, {
      value: '1',
      expiresAt: now + CLAIMED_TOKEN_TTL_MS
    })
    return {
      rateLimited: false,
      inviteToken: token,
      hostSessionId: id,
      storage: 'memory'
    }
  }
  return { rateLimited: false, inviteToken: null, storage: 'memory' }
}

function blobPresenceKey(sessionId) {
  return `mp-stats:presence:${sessionId}`
}

function blobOpenKey(sessionId) {
  return `mp-stats:open:${sessionId}`
}

async function listBlobKeys(store, prefix) {
  if (typeof store.list !== 'function') return []
  const listed = await store.list(prefix)
  if (Array.isArray(listed)) return listed
  return (listed?.blobs || []).map(blob => blob.key).filter(Boolean)
}

async function blobRateAllows(store, key, now) {
  const current = await store.get(key)
  if (!current || now - Number(current.windowStart) >= RATE_LIMIT_WINDOW_MS) {
    await store.set(key, { count: 1, windowStart: now })
    return true
  }
  const count = Number(current.count) + 1
  await store.set(key, { count, windowStart: current.windowStart })
  return count <= RATE_LIMIT_MAX
}

export async function blobsPresence(store, input) {
  const now = input.now
  if (!await blobRateAllows(store, `mp-stats:rl:${input.sessionId}`, now)) {
    return { rateLimited: true }
  }
  const staleBefore = now - PRESENCE_STALE_MS
  await store.set(blobPresenceKey(input.sessionId), {
    status: input.status,
    seenAt: now
  })
  const raw = {}
  PRESENCE_STATUSES.forEach(status => {
    raw[status] = 0
  })
  const keys = await listBlobKeys(store, 'mp-stats:presence:')
  for (const key of keys) {
    const row = await store.get(key)
    if (!row || Number(row.seenAt) < staleBefore || !PRESENCE_STATUSES.includes(row.status)) {
      await store.delete(key)
      continue
    }
    raw[row.status] += 1
  }
  let openSlot = 'closed'
  if (input.openInviteToken) {
    const claimed = await store.get(`mp-stats:claimed:${input.openInviteToken}`)
    if (claimed && now - Number(claimed.at) < CLAIMED_TOKEN_TTL_MS) {
      await store.delete(blobOpenKey(input.sessionId))
      openSlot = 'filled'
    } else {
      await store.set(blobOpenKey(input.sessionId), {
        inviteToken: input.openInviteToken,
        seenAt: now
      })
      openSlot = 'listed'
    }
  } else {
    await store.delete(blobOpenKey(input.sessionId))
  }
  return {
    rateLimited: false,
    openSlot,
    storage: 'blobs',
    ...summarizePresenceCounts(raw)
  }
}

export async function blobsClaim(store, input) {
  const now = input.now
  if (!await blobRateAllows(store, `mp-stats:rl:claim:${input.sessionId}`, now)) {
    return { rateLimited: true }
  }
  const staleBefore = now - PRESENCE_STALE_MS
  const keys = await listBlobKeys(store, 'mp-stats:open:')
  const candidates = []
  for (const key of keys) {
    const hostSessionId = key.slice('mp-stats:open:'.length)
    const row = await store.get(key)
    if (!row || Number(row.seenAt) < staleBefore || typeof row.inviteToken !== 'string') {
      await store.delete(key)
      continue
    }
    if (hostSessionId === input.sessionId) continue
    candidates.push({ hostSessionId, inviteToken: row.inviteToken, seenAt: Number(row.seenAt), key })
  }
  candidates.sort((left, right) => left.seenAt - right.seenAt)
  for (const candidate of candidates) {
    const claimKey = `mp-stats:claim:${candidate.hostSessionId}:${candidate.inviteToken}`
    let claimed = false
    try {
      const result = await store.set(claimKey, { at: now }, { onlyIfNew: true })
      claimed = result?.modified !== false
    } catch {
      claimed = false
    }
    if (!claimed) continue
    await store.delete(candidate.key)
    await store.set(`mp-stats:claimed:${candidate.inviteToken}`, { at: now })
    return {
      rateLimited: false,
      inviteToken: candidate.inviteToken,
      hostSessionId: candidate.hostSessionId,
      storage: 'blobs'
    }
  }
  return { rateLimited: false, inviteToken: null, storage: 'blobs' }
}

export function interpretPresenceEval(result) {
  if (!Array.isArray(result) || result[0] === 'rate') return { rateLimited: true }
  const raw = {}
  PRESENCE_STATUSES.forEach((status, index) => {
    raw[status] = Number(result[index]) || 0
  })
  const openSlot = result[5] === 'listed' || result[5] === 'filled' ? result[5] : 'closed'
  return {
    rateLimited: false,
    openSlot,
    storage: 'redis',
    ...summarizePresenceCounts(raw)
  }
}

export function interpretClaimEval(result) {
  if (!Array.isArray(result) || result[0] === 'rate') {
    return { rateLimited: result?.[0] === 'rate' }
  }
  if (!result[0] || !result[1]) {
    return { rateLimited: false, inviteToken: null, storage: 'redis' }
  }
  return {
    rateLimited: false,
    hostSessionId: String(result[0]),
    inviteToken: String(result[1]),
    storage: 'redis'
  }
}

export function presencePipeline(input) {
  return [[
    'EVAL',
    PRESENCE_LUA,
    '0',
    input.sessionId,
    input.status,
    String(input.now),
    String(input.now - PRESENCE_STALE_MS),
    String(RATE_LIMIT_MAX),
    String(Math.round(RATE_LIMIT_WINDOW_MS / 1000)),
    input.openInviteToken || ''
  ]]
}

export function claimPipeline(input) {
  return [[
    'EVAL',
    CLAIM_LUA,
    '0',
    input.sessionId,
    String(input.now),
    String(input.now - PRESENCE_STALE_MS),
    String(RATE_LIMIT_MAX),
    String(Math.round(RATE_LIMIT_WINDOW_MS / 1000))
  ]]
}

export async function upstashPipeline(fetchImpl, redis, commands) {
  const response = await fetchImpl(`${redis.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redis.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  })
  if (!response.ok) {
    const error = new Error('upstash request failed')
    error.status = response.status
    throw error
  }
  const payload = await response.json()
  if (!Array.isArray(payload)) throw new Error('upstash payload')
  return payload.map(entry => {
    if (entry && typeof entry === 'object' && entry.error) {
      throw new Error(String(entry.error))
    }
    if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'result')) {
      return entry.result
    }
    return entry
  })
}

export async function redisPresence(fetchImpl, redis, input) {
  const [result] = await upstashPipeline(fetchImpl, redis, presencePipeline(input))
  return interpretPresenceEval(result)
}

export async function redisClaim(fetchImpl, redis, input) {
  const [result] = await upstashPipeline(fetchImpl, redis, claimPipeline(input))
  return interpretClaimEval(result)
}

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  })
}

function outcomeResponse(outcome, options = {}) {
  if (outcome.rateLimited) {
    return jsonResponse(429, { error: 'rate_limited' }, { 'Retry-After': '15' })
  }
  const body = { ...outcome }
  delete body.rateLimited
  delete body.hostSessionId
  delete body.storage
  if (options.debug) {
    const backend = outcome.storage === 'redis' || outcome.storage === 'blobs' || outcome.storage === 'memory'
      ? outcome.storage
      : 'blobs'
    body.backend = backend
    body.storage = backend
    body.redisConfigured = backend === 'redis'
    if (options.handler) body.handler = options.handler
  }
  return jsonResponse(200, body)
}

export async function handleMultiplayerStatsRequest(request, options = {}) {
  const route = statsRoute(new URL(request.url).pathname)
  if (!route) return null
  if (request.method === 'OPTIONS') return jsonResponse(204, null)
  if (request.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' })

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { error: 'invalid_request' })
  }
  const parsed = route === 'presence' ? parsePresenceBody(body) : parseClaimBody(body)
  if (parsed.error) return jsonResponse(400, { error: 'invalid_request' })

  const now = typeof options.now === 'function' ? options.now() : Date.now()
  const input = { ...parsed, now }
  const redis = readRuntimeRedisEnv(options.env || {})
  try {
    let outcome
    if (redis) {
      const fetchImpl = options.fetchImpl || fetch
      outcome = route === 'presence'
        ? await redisPresence(fetchImpl, redis, input)
        : await redisClaim(fetchImpl, redis, input)
    } else if (options.memory) {
      outcome = route === 'presence'
        ? applyPresence(options.memory, input)
        : claimOpenHost(options.memory, input)
    } else if (options.blobs) {
      outcome = route === 'presence'
        ? await blobsPresence(options.blobs, input)
        : await blobsClaim(options.blobs, input)
    } else {
      return jsonResponse(503, { error: 'unavailable' })
    }
    return outcomeResponse(outcome, {
      ...options,
      debug: statsDebugEnabled(options.env || {})
    })
  } catch {
    return jsonResponse(503, { error: 'unavailable' })
  }
}

export function adaptNetlifyBlobStore(store) {
  return {
    async get(key) {
      try {
        const value = await store.get(key, { type: 'json' })
        return value || null
      } catch {
        return null
      }
    },
    async set(key, value, options = {}) {
      try {
        const result = await store.setJSON(key, value, options.onlyIfNew ? { onlyIfNew: true } : undefined)
        if (result && result.modified === false) return { modified: false }
        return { modified: true }
      } catch (error) {
        if (options.onlyIfNew) return { modified: false }
        throw error
      }
    },
    async delete(key) {
      if (typeof store.delete === 'function') await store.delete(key)
    },
    async list(prefix) {
      const page = await store.list({ prefix })
      return (page?.blobs || []).map(blob => blob.key)
    }
  }
}
