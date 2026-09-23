const detectStunHost = () => {
  // Check for explicit environment variable override first (for custom setups)
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_STUN_HOST) {
    return import.meta.env.VITE_STUN_HOST
  }
  if (typeof window !== 'undefined' && window.STUN_HOST) {
    return window.STUN_HOST
  }
  // Default: use relative URLs for both netlify dev and production
  // This works because netlify dev proxies /api/* to the functions
  return ''
}

export const STUN_HOST = detectStunHost()

async function postJson(endpoint, payload) {
  const url = STUN_HOST === '' ? `/api${endpoint}` : `${STUN_HOST}${endpoint}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(`Signalling ${endpoint} failed: ${response.status}`)
  }

  return response.json().catch(() => ({}))
}

export function postOffer(payload) {
  return postJson('/signalling/offer', payload)
}

export function postAnswer(payload) {
  return postJson('/signalling/answer', payload)
}

export function postCandidate(payload) {
  return postJson('/signalling/candidate', payload)
}

export function fetchIceServers() {
  const cacheBuster = `_t=${Date.now()}`
  const url = STUN_HOST === ''
    ? `/api/signalling/ice-servers?${cacheBuster}`
    : `${STUN_HOST}/signalling/ice-servers?${cacheBuster}`

  return fetch(url, {
    cache: 'no-store'
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to fetch ICE servers (${response.status})`)
    }
    return response.json().catch(() => ({}))
  })
}

export function fetchPendingSessions(inviteToken) {
  if (!inviteToken) {
    throw new Error('Invite token is required to fetch pending sessions')
  }

  // Add cache-busting timestamp to prevent CDN/edge caching
  const cacheBuster = `_t=${Date.now()}`
  const url = STUN_HOST === ''
    ? `/api/signalling/pending/${encodeURIComponent(inviteToken)}?${cacheBuster}`
    : `${STUN_HOST}/signalling/pending/${encodeURIComponent(inviteToken)}?${cacheBuster}`

  return fetch(url, {
    cache: 'no-store'
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to fetch pending sessions (${response.status})`)
    }
    return response.json().catch(() => [])
  })
}

export async function fetchSessionStatus(inviteToken, peerId) {
  if (!inviteToken || !peerId) {
    throw new Error('Invite token and peerId are required to fetch signalling session data')
  }

  // Add cache-busting timestamp to prevent CDN/edge caching
  const cacheBuster = `_t=${Date.now()}`
  const url = STUN_HOST === ''
    ? `/api/signalling/session/${encodeURIComponent(inviteToken)}/${encodeURIComponent(peerId)}?${cacheBuster}`
    : `${STUN_HOST}/signalling/session/${encodeURIComponent(inviteToken)}/${encodeURIComponent(peerId)}?${cacheBuster}`

  const response = await fetch(url, {
    cache: 'no-store'
  })

  if (!response.ok) {
    throw new Error(`Failed to retrieve signalling session (${response.status})`)
  }

  return response.json().catch(() => ({}))
}

export function generateSessionKey(inviteToken, peerId) {
  return `${inviteToken}-${peerId}`
}
