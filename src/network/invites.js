import { normalizeShortCode } from './inviteCodes.js'

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

const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]+$/
const INVITE_PARTY_PATTERN = /^player\d+$/
const INVITE_TIMESTAMP_PATTERN = /^\d{10,}$/

function cleanInviteCode(value) {
  if (typeof value !== 'string') {
    return null
  }
  let code = value.trim().replace(/\/+$/, '')
  if (!code) {
    return null
  }
  try {
    const decoded = decodeURIComponent(code)
    code = decoded.trim().replace(/\/+$/, '')
  } catch {
    // Keep the raw value when it is not valid percent-encoding.
  }
  if (!code || /\s/.test(code)) {
    return null
  }
  return code
}

/**
 * Invite tokens are `${gameInstanceId}-${partyId}-${timestamp}`.
 * The same shape is what `?invite=` carries, so a bare code and a URL
 * must pass the same check.
 */
export function isInviteCode(code) {
  if (!code || !INVITE_CODE_PATTERN.test(code)) {
    return false
  }
  const parts = code.split('-')
  if (parts.length < 3 || parts.some(part => part.length === 0)) {
    return false
  }
  const timestamp = parts[parts.length - 1]
  if (!INVITE_TIMESTAMP_PATTERN.test(timestamp)) {
    return false
  }
  return parts.some(part => INVITE_PARTY_PATTERN.test(part))
}

function inviteValueFromUrl(url) {
  const fromQuery = cleanInviteCode(url.searchParams.get('invite') || '')
  if (fromQuery) return fromQuery

  const hash = String(url.hash || '').replace(/^#/, '')
  if (!hash.includes('invite=')) return null
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash
  try {
    return cleanInviteCode(new URLSearchParams(query).get('invite') || '')
  } catch {
    return null
  }
}

function classifiedValue(value) {
  if (value && isInviteCode(value)) return { kind: 'token', token: value }
  const shortCode = normalizeShortCode(value || '')
  if (shortCode) return { kind: 'short', code: shortCode }
  return null
}

function collectInviteUrls(trimmed) {
  const urls = []
  const push = (candidate) => {
    try {
      urls.push(new URL(candidate))
    } catch {
      // Not a URL in this form.
    }
  }

  push(trimmed)
  if (trimmed.startsWith('//')) {
    push(`https:${trimmed}`)
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    push(`https://${trimmed.replace(/^\/\//, '')}`)
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('?')) {
    try {
      push(new URL(trimmed, 'https://invite.invalid').href)
    } catch {
      // Relative input that is not a URL path.
    }
  }
  return urls
}

function looksLikeUrl(value) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value)
    || value.startsWith('//')
    || value.startsWith('/')
    || value.startsWith('?')
    || value.includes('://')
    || /^[\w.-]+:\d+(?:[/?#]|$)/.test(value)
    || /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value)
}

/**
 * Classify join input as a long invite token or a short typeable code.
 * A full URL yields the long token in `invite`. A short code ignores case,
 * spaces, and dashes. Anything else is null.
 * @param {string} input
 * @returns {{ kind: 'token', token: string } | { kind: 'short', code: string } | null}
 */
export function classifyInviteInput(input) {
  if (typeof input !== 'string') return null
  const trimmed = input.trim().replace(/^['"]+|['"]+$/g, '').trim()
  if (!trimmed) return null

  for (const url of collectInviteUrls(trimmed)) {
    const classified = classifiedValue(inviteValueFromUrl(url))
    if (classified) return classified
  }

  if (looksLikeUrl(trimmed)) return null

  const bare = cleanInviteCode(trimmed)
  const fromBare = classifiedValue(bare)
  if (fromBare) return fromBare
  return classifiedValue(trimmed)
}

/**
 * Long invite token from a full URL or from the token pasted on its own.
 * Short codes are not returned here; use classifyInviteInput for those.
 * @param {string} input
 * @returns {string|null}
 */
export function parseInviteInput(input) {
  const classified = classifyInviteInput(input)
  return classified?.kind === 'token' ? classified.token : null
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
