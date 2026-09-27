/**
 * Short invite codes are what a person can read aloud or type.
 * They are not the long invite token stored in the link.
 * Alphabet omits 0/O and 1/I/L so the glyphs stay distinct.
 */
export const SHORT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const SHORT_CODE_LENGTH = 6
export const SHORT_CODE_MAX_LENGTH = 10
export const INVITE_CODE_TTL_MS = 10 * 60 * 1000

const AMBIGUOUS = /[0O1IL]/

function randomIndex(random) {
  const sample = Number(typeof random === 'function' ? random() : Math.random())
  const unit = Number.isFinite(sample) ? Math.abs(sample) % 1 : 0
  return Math.floor(unit * SHORT_CODE_ALPHABET.length) % SHORT_CODE_ALPHABET.length
}

export function generateShortCode(random = Math.random) {
  let code = ''
  for (let index = 0; index < SHORT_CODE_LENGTH; index += 1) {
    code += SHORT_CODE_ALPHABET[randomIndex(random)]
  }
  return code
}

/**
 * Accept typed codes regardless of case, spaces, or grouping dashes.
 * @param {string} input
 * @returns {string|null}
 */
export function normalizeShortCode(input) {
  if (typeof input !== 'string') return null
  const compact = input.toUpperCase().replace(/[\s\u2010\u2011\u2012\u2013\u2014\u2212-]+/g, '')
  if (compact.length < SHORT_CODE_LENGTH || compact.length > SHORT_CODE_MAX_LENGTH) return null
  if (AMBIGUOUS.test(compact)) return null
  if (![...compact].every(char => SHORT_CODE_ALPHABET.includes(char))) return null
  return compact
}

export function formatShortCode(code) {
  const normalized = normalizeShortCode(typeof code === 'string' ? code : '')
  if (!normalized) return ''
  const midpoint = Math.ceil(normalized.length / 2)
  return `${normalized.slice(0, midpoint)}-${normalized.slice(midpoint)}`
}

export function isActiveInviteCode(record, now = Date.now()) {
  return Boolean(record && Number(record.expiresAt) > now)
}

export async function allocateShortCode(isActive, random = Math.random, maxAttempts = 32) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateShortCode(random)
    if (!(await isActive(code))) return code
  }
  throw new Error('Could not allocate a unique invite code')
}

async function releasePartyCode(storage, instanceId, partyId) {
  const previous = await storage.getParty(instanceId, partyId)
  if (!previous) return
  const existing = await storage.getCode(previous)
  if (existing && existing.instanceId === instanceId && existing.partyId === partyId) {
    await storage.deleteCode(previous)
  }
  await storage.deleteParty(instanceId, partyId)
}

/**
 * Issue a short code for one party. Replaces that party's previous code.
 * Regenerates when the candidate is already held by another active invite.
 */
export async function issueStoredInviteCode(storage, {
  instanceId,
  partyId,
  inviteToken,
  preferredCode = '',
  now = Date.now(),
  random = Math.random,
  ttlMs = INVITE_CODE_TTL_MS
} = {}) {
  if (!instanceId || !partyId || !inviteToken) {
    throw new Error('instanceId, partyId, and inviteToken are required')
  }
  await releasePartyCode(storage, instanceId, partyId)

  let shortCode = normalizeShortCode(preferredCode)
  if (shortCode) {
    const existing = await storage.getCode(shortCode)
    const heldByOther = isActiveInviteCode(existing, now)
      && (existing.instanceId !== instanceId || existing.partyId !== partyId)
    if (heldByOther) shortCode = null
  }
  if (!shortCode) {
    shortCode = await allocateShortCode(async(candidate) => {
      const existing = await storage.getCode(candidate)
      return isActiveInviteCode(existing, now)
    }, random)
  }

  const record = {
    shortCode,
    inviteToken,
    partyId,
    instanceId,
    expiresAt: now + ttlMs
  }
  await storage.setCode(record)
  await storage.setParty(instanceId, partyId, shortCode)
  return record
}

export async function resolveStoredInviteCode(storage, input, now = Date.now()) {
  const shortCode = normalizeShortCode(input)
  if (!shortCode) return null
  const record = await storage.getCode(shortCode)
  if (!isActiveInviteCode(record, now)) {
    if (record) await storage.deleteCode(shortCode)
    return null
  }
  return record
}

export async function releaseStoredInviteCode(storage, instanceId, partyId) {
  if (!instanceId || !partyId) return
  await releasePartyCode(storage, instanceId, partyId)
}

export function createMemoryInviteCodeStorage() {
  const codes = new Map()
  const parties = new Map()
  const partyKey = (instanceId, partyId) => `${instanceId}:${partyId}`
  return {
    async getCode(code) {
      return codes.get(code) || null
    },
    async setCode(record) {
      codes.set(record.shortCode, { ...record })
    },
    async deleteCode(code) {
      codes.delete(code)
    },
    async getParty(instanceId, partyId) {
      return parties.get(partyKey(instanceId, partyId)) || null
    },
    async setParty(instanceId, partyId, shortCode) {
      parties.set(partyKey(instanceId, partyId), shortCode)
    },
    async deleteParty(instanceId, partyId) {
      parties.delete(partyKey(instanceId, partyId))
    }
  }
}
