import { createHmac } from 'node:crypto'
import { describeIceUrl, parseTurnUrls } from './iceSummary.js'

export const DEFAULT_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302'
]

const DEFAULT_TURN_TTL_SECONDS = 12 * 60 * 60

export function createEphemeralTurnCredential(secret, ttlSeconds = DEFAULT_TURN_TTL_SECONDS, nowSeconds = Math.floor(Date.now() / 1000)) {
  const expiry = nowSeconds + ttlSeconds
  const username = `${expiry}:cfb`
  const credential = createHmac('sha1', secret).update(username).digest('base64')
  return { username, credential, ttlSeconds, expiresAt: expiry }
}

export function buildIceServerPayload(env = {}) {
  const turnUrls = parseTurnUrls(env.TURN_URLS)
  const secret = String(env.TURN_SECRET || '').trim()
  const username = String(env.TURN_USERNAME || '').trim()
  const credential = String(env.TURN_CREDENTIAL || '').trim()
  const iceServers = [{ urls: DEFAULT_STUN_URLS.slice() }]
  let credentialMode = 'none'
  let ttlSeconds = null

  if (turnUrls.length && secret) {
    const ephemeral = createEphemeralTurnCredential(secret)
    iceServers.push({
      urls: turnUrls,
      username: ephemeral.username,
      credential: ephemeral.credential
    })
    credentialMode = 'ephemeral'
    ttlSeconds = ephemeral.ttlSeconds
  } else if (turnUrls.length && username && credential) {
    iceServers.push({ urls: turnUrls, username, credential })
    credentialMode = 'static'
  }

  return {
    iceServers,
    turnConfigured: credentialMode !== 'none',
    credentialMode,
    ttlSeconds,
    turnHosts: turnUrls.map((url) => describeIceUrl(url).host)
  }
}
