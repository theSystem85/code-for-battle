import {
  countCandidateSummaries,
  describeIceUrl,
  emptyCandidateStats,
  iceServerHasTurnCredentials,
  isBenignIceError,
  parseIceServersConfig,
  parseTurnUrls,
  recordCandidateStat,
  safeAlias,
  summarizeIceCandidate,
  summarizeIceServers
} from './iceSummary.js'

export {
  countCandidateSummaries,
  describeIceUrl,
  emptyCandidateStats,
  iceServerHasTurnCredentials,
  isBenignIceError,
  parseIceServersConfig,
  parseTurnUrls,
  recordCandidateStat,
  safeAlias,
  summarizeIceCandidate,
  summarizeIceServers
}

const DEFAULT_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302'
]

const ICE_CONFIG_CACHE_MS = 5 * 60 * 1000
const ICE_GATHER_TIMEOUT_MS = 4000

let cachedIceConfig = null
let cachedIceConfigAt = 0

function readVite(name) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
      return String(import.meta.env[name])
    }
  } catch {
    // import.meta.env exists only in the Vite client build.
  }
  return ''
}

export function normalizeIceServers(payload) {
  const list = Array.isArray(payload?.iceServers) ? payload.iceServers : []
  const normalized = []
  list.forEach((server) => {
    if (!server) return
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
    const safeUrls = urls.filter((url) => {
      const value = String(url || '')
      return value.startsWith('stun:') || value.startsWith('stuns:') || value.startsWith('turn:') || value.startsWith('turns:')
    })
    if (!safeUrls.length) return
    const next = { urls: safeUrls }
    if (server.username) next.username = String(server.username)
    if (server.credential) next.credential = String(server.credential)
    normalized.push(next)
  })
  if (!normalized.length) {
    normalized.push({ urls: DEFAULT_STUN_URLS.slice() })
  }
  return normalized
}

export function buildFallbackIceConfigFromEnv(env = {}) {
  const configured = parseIceServersConfig(env.VITE_ICE_SERVERS || env.ICE_SERVERS)
  const iceServers = [{ urls: DEFAULT_STUN_URLS.slice() }, ...configured]
  const turnUrls = parseTurnUrls(env.VITE_TURN_URLS)
  const username = String(env.VITE_TURN_USERNAME || '').trim()
  const credential = String(env.VITE_TURN_CREDENTIAL || '').trim()
  if (!iceServers.some(iceServerHasTurnCredentials) && turnUrls.length && username && credential) {
    iceServers.push({ urls: turnUrls, username, credential })
  }
  const turnConfigured = iceServers.some(iceServerHasTurnCredentials)
  let credentialMode = 'none'
  if (turnConfigured && configured.some(iceServerHasTurnCredentials)) credentialMode = 'vite-ice-servers'
  else if (turnConfigured) credentialMode = 'vite-static'
  return {
    iceServers,
    turnConfigured,
    credentialMode,
    source: 'fallback'
  }
}

export function fallbackIceConfig() {
  return buildFallbackIceConfigFromEnv({
    VITE_ICE_SERVERS: readVite('VITE_ICE_SERVERS'),
    VITE_TURN_URLS: readVite('VITE_TURN_URLS'),
    VITE_TURN_USERNAME: readVite('VITE_TURN_USERNAME'),
    VITE_TURN_CREDENTIAL: readVite('VITE_TURN_CREDENTIAL')
  })
}

export function buildPeerConnectionConfig(iceServers) {
  const servers = Array.isArray(iceServers) && iceServers.length
    ? iceServers
    : [{ urls: DEFAULT_STUN_URLS.slice() }]
  return {
    iceServers: servers,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 0
  }
}

export function formatIceProgress({ connectionState, iceConnectionState, iceGatheringState } = {}) {
  const ice = iceConnectionState || 'unknown'
  const connection = connectionState || 'unknown'
  const parts = [`ICE ${ice}`, `connection ${connection}`]
  if (iceGatheringState && iceGatheringState !== 'complete') {
    parts.push(`gathering ${iceGatheringState}`)
  }
  return parts.join(', ')
}

export function buildJoinFailureHint({ turnConfigured = false, stats = null } = {}) {
  const relay = stats?.relay || 0
  if (!turnConfigured && relay === 0) {
    return 'Could not open a network path to the host. Browsers on the same computer can connect directly, but phones and other devices need a TURN relay. No TURN server is configured on this deployment.'
  }
  if (turnConfigured && relay === 0) {
    return 'Could not open a network path to the host. TURN is configured, but this device gathered no relay candidates. Check that the TURN server is reachable on this network.'
  }
  return 'Could not open a network path to the host after retrying the connection.'
}

export function resetIceServerCache() {
  cachedIceConfig = null
  cachedIceConfigAt = 0
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ice-config-timeout')), timeoutMs)
    promise.then((value) => {
      clearTimeout(timer)
      resolve(value)
    }, (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

export async function resolveIceServers() {
  if (cachedIceConfig && Date.now() - cachedIceConfigAt < ICE_CONFIG_CACHE_MS) {
    return cachedIceConfig
  }
  let result = fallbackIceConfig()
  try {
    const signalling = await import('./signalling.js')
    if (typeof signalling.fetchIceServers === 'function') {
      const payload = await withTimeout(signalling.fetchIceServers(), ICE_GATHER_TIMEOUT_MS)
      const iceServers = normalizeIceServers(payload)
      result = {
        iceServers,
        turnConfigured: Boolean(payload?.turnConfigured),
        credentialMode: payload?.credentialMode || (payload?.turnConfigured ? 'remote' : 'none'),
        source: 'signalling'
      }
    }
  } catch (err) {
    result = {
      ...fallbackIceConfig(),
      source: 'fallback',
      error: err?.message || 'ice-config-fetch-failed'
    }
  }
  cachedIceConfig = result
  cachedIceConfigAt = Date.now()
  return result
}

export function waitForIceGathering(pc, timeoutMs = ICE_GATHER_TIMEOUT_MS) {
  if (!pc || pc.iceGatheringState == null || pc.iceGatheringState === 'complete') {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      pc.removeEventListener('icegatheringstatechange', onChange)
      clearTimeout(timer)
      resolve()
    }
    const onChange = () => {
      if (!pc || pc.iceGatheringState === 'complete') finish()
    }
    pc.addEventListener('icegatheringstatechange', onChange)
    const timer = setTimeout(finish, timeoutMs)
  })
}
