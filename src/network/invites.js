function inviteOrigin() {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin
  }
  return 'http://localhost:5173'
}

export function composeInviteToken(gameInstanceId, partyId) {
  return `${gameInstanceId}-${partyId}-${Date.now()}`
}

/**
 * Parse the partyId from an invite token
 * Token format: ${gameInstanceId}-${partyId}-${timestamp}
 * @param {string} token - The invite token
 * @returns {string|null} The partyId or null if parsing fails
 */
export function parsePartyIdFromToken(token) {
  if (!token || typeof token !== 'string') {
    return null
  }

  // Split by '-' and find the partyId part
  // Format: gameInstanceId-partyId-timestamp
  // partyId typically looks like 'player1', 'player2', etc.
  const parts = token.split('-')
  if (parts.length < 3) {
    return null
  }

  // The partyId is typically the second-to-last part before the timestamp
  // Timestamp is the last part (numeric)
  // But gameInstanceId might contain hyphens, so we need to find partyId more carefully
  // Look for 'player1', 'player2', 'player', etc. in the parts
  for (let i = parts.length - 2; i >= 0; i--) {
    const part = parts[i]
    // Check if this looks like a partyId (starts with 'player')
    if (part && part.startsWith('player')) {
      return part
    }
  }

  // Fallback: second-to-last part
  return parts[parts.length - 2] || null
}

export function buildInviteUrl(token) {
  return `${inviteOrigin()}?invite=${token}`
}

export function describeInviteReachability(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return 'This invite link is not a valid URL, so another device cannot open it.'
  }
  const host = String(parsed.hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0'
  if (loopback) {
    return 'This link points at this computer (localhost). A phone or tablet cannot open it. Open the game on the public HTTPS site and create the invite there.'
  }
  if (parsed.protocol !== 'https:') {
    return 'This page is not HTTPS. A phone can open an http link on the same Wi-Fi, but iPhone and iPad Safari will not start WebRTC unless the page is a secure context. Use the public HTTPS site to invite another device.'
  }
  return ''
}

export function humanReadablePartyLabel(color, owner) {
  return `${color}: ${owner}`
}
