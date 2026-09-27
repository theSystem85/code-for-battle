import { describe, expect, it } from 'vitest'
import '../setup.js'
import {
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  allocateShortCode,
  createMemoryInviteCodeStorage,
  formatShortCode,
  generateShortCode,
  issueStoredInviteCode,
  normalizeShortCode,
  resolveStoredInviteCode
} from '../../src/network/inviteCodes.js'

const TOKEN = '11111111-2222-4333-8444-555555555555-player2-1710000000000'

function sequentialRandom(start = 0) {
  let cursor = start
  return () => {
    const value = (cursor % SHORT_CODE_ALPHABET.length) / SHORT_CODE_ALPHABET.length
    cursor += 1
    return value
  }
}

describe('invite short codes', () => {
  it('generates a 6 character code from the unambiguous alphabet', () => {
    const code = generateShortCode(() => 0)
    expect(code).toHaveLength(SHORT_CODE_LENGTH)
    expect(code).toBe('AAAAAA')
    expect([...code].every(char => SHORT_CODE_ALPHABET.includes(char))).toBe(true)
    expect(code).not.toMatch(/[0O1IL]/)
    expect(SHORT_CODE_ALPHABET).not.toMatch(/[0O1IL]/)
  })

  it('normalizes case, spaces, and dashes and rejects ambiguous or wrong-length input', () => {
    expect(normalizeShortCode(' ab c-def ')).toBe('ABCDEF')
    expect(normalizeShortCode('K7M–Q4P')).toBe('K7MQ4P')
    expect(normalizeShortCode('K7M—Q4P')).toBe('K7MQ4P')
    expect(normalizeShortCode('AbC-DeF')).toBe('ABCDEF')
    expect(formatShortCode('abcdef')).toBe('ABC-DEF')
    expect(normalizeShortCode('abc')).toBeNull()
    expect(normalizeShortCode('ABCDEFGHJKM')).toBeNull()
    expect(normalizeShortCode('ABC12I')).toBeNull()
    expect(normalizeShortCode('ABC120')).toBeNull()
    expect(normalizeShortCode('HELLOO')).toBeNull()
    expect(normalizeShortCode(TOKEN)).toBeNull()
  })

  it('gives each party its own code and drops the previous code when that party is reissued', async() => {
    const storage = createMemoryInviteCodeStorage()
    const random = sequentialRandom()
    const red = await issueStoredInviteCode(storage, {
      instanceId: 'game',
      partyId: 'player2',
      inviteToken: `${TOKEN}-red`,
      random,
      now: 1_000
    })
    const blue = await issueStoredInviteCode(storage, {
      instanceId: 'game',
      partyId: 'player3',
      inviteToken: `${TOKEN}-blue`,
      random,
      now: 1_000
    })
    expect(red.shortCode).not.toBe(blue.shortCode)
    expect(await resolveStoredInviteCode(storage, red.shortCode.toLowerCase(), 1_000)).toMatchObject({
      inviteToken: `${TOKEN}-red`,
      partyId: 'player2'
    })
    expect(await resolveStoredInviteCode(storage, ` ${blue.shortCode.slice(0, 3)}-${blue.shortCode.slice(3)} `, 1_000)).toMatchObject({
      partyId: 'player3'
    })

    const replacement = await issueStoredInviteCode(storage, {
      instanceId: 'game',
      partyId: 'player2',
      inviteToken: `${TOKEN}-next`,
      random,
      now: 1_000
    })
    expect(replacement.shortCode).not.toBe(red.shortCode)
    expect(await resolveStoredInviteCode(storage, red.shortCode, 1_000)).toBeNull()
    expect((await resolveStoredInviteCode(storage, replacement.shortCode, 1_000)).inviteToken).toBe(`${TOKEN}-next`)
    expect((await resolveStoredInviteCode(storage, blue.shortCode, 1_000)).partyId).toBe('player3')
  })

  it('regenerates when a candidate collides with another active invite', async() => {
    const storage = createMemoryInviteCodeStorage()
    let calls = 0
    const random = () => {
      calls += 1
      return calls <= SHORT_CODE_LENGTH ? 0 : 1.1 / SHORT_CODE_ALPHABET.length
    }
    await storage.setCode({
      shortCode: 'AAAAAA',
      inviteToken: 'taken',
      partyId: 'player4',
      instanceId: 'other-game',
      expiresAt: 5_000
    })
    await storage.setParty('other-game', 'player4', 'AAAAAA')

    const issued = await issueStoredInviteCode(storage, {
      instanceId: 'game',
      partyId: 'player2',
      inviteToken: TOKEN,
      random,
      now: 1_000
    })
    expect(issued.shortCode).not.toBe('AAAAAA')
    expect(issued.shortCode).toHaveLength(SHORT_CODE_LENGTH)
    expect((await resolveStoredInviteCode(storage, 'AAAAAA', 1_000)).inviteToken).toBe('taken')
    expect((await resolveStoredInviteCode(storage, issued.shortCode, 1_000)).partyId).toBe('player2')
  })

  it('stops resolving a code once it expires with the invite', async() => {
    const storage = createMemoryInviteCodeStorage()
    const issued = await issueStoredInviteCode(storage, {
      instanceId: 'game',
      partyId: 'player2',
      inviteToken: TOKEN,
      random: () => 0,
      now: 1_000,
      ttlMs: 50
    })
    expect(await resolveStoredInviteCode(storage, issued.shortCode, 1_049)).toMatchObject({ inviteToken: TOKEN })
    expect(await resolveStoredInviteCode(storage, issued.shortCode, 1_050)).toBeNull()
    expect(await resolveStoredInviteCode(storage, issued.shortCode, 1_050)).toBeNull()
  })

  it('throws when every attempt collides', async() => {
    await expect(allocateShortCode(async() => true, () => 0, 3)).rejects.toThrow(/unique invite code/)
  })
})
