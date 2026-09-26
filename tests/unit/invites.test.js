import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../setup.js'

import {
  composeInviteToken,
  parsePartyIdFromToken,
  buildInviteUrl,
  humanReadablePartyLabel,
  classifyInviteInput,
  isInviteCode,
  parseInviteInput
} from '../../src/network/invites.js'

const INVITE_CODE = '11111111-2222-4333-8444-555555555555-player2-1710000000000'

describe('invites.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('composeInviteToken', () => {
    it('creates a token from gameInstanceId and partyId', () => {
      const token = composeInviteToken('game123', 'player1')
      expect(token).toMatch(/^game123-player1-\d+$/)
    })

    it('includes a timestamp in the token', () => {
      const now = Date.now()
      const token = composeInviteToken('testGame', 'player2')
      const parts = token.split('-')
      const timestamp = parseInt(parts[parts.length - 1], 10)
      expect(timestamp).toBeGreaterThanOrEqual(now)
      expect(timestamp).toBeLessThanOrEqual(Date.now())
    })

    it('handles special characters in gameInstanceId', () => {
      const token = composeInviteToken('game-with-dashes', 'player1')
      expect(token).toContain('game-with-dashes')
      expect(token).toContain('player1')
    })

    it('handles empty strings', () => {
      const token = composeInviteToken('', '')
      expect(token).toMatch(/^--\d+$/)
    })

    it('creates unique tokens based on timestamp', async() => {
      const token1 = composeInviteToken('game', 'player1')
      await new Promise(resolve => setTimeout(resolve, 5))
      const token2 = composeInviteToken('game', 'player1')
      expect(token1).not.toBe(token2)
    })
  })

  describe('parsePartyIdFromToken', () => {
    it('returns null for null input', () => {
      expect(parsePartyIdFromToken(null)).toBeNull()
    })

    it('returns null for undefined input', () => {
      expect(parsePartyIdFromToken(undefined)).toBeNull()
    })

    it('returns null for non-string input', () => {
      expect(parsePartyIdFromToken(123)).toBeNull()
      expect(parsePartyIdFromToken({})).toBeNull()
      expect(parsePartyIdFromToken([])).toBeNull()
    })

    it('returns null for token with fewer than 3 parts', () => {
      expect(parsePartyIdFromToken('game-player1')).toBeNull()
      expect(parsePartyIdFromToken('single')).toBeNull()
      expect(parsePartyIdFromToken('')).toBeNull()
    })

    it('extracts partyId from a valid token with "player" prefix', () => {
      const token = composeInviteToken('game123', 'player1')
      expect(parsePartyIdFromToken(token)).toBe('player1')
    })

    it('extracts partyId when gameInstanceId contains dashes', () => {
      const token = 'game-with-many-dashes-player2-1234567890'
      expect(parsePartyIdFromToken(token)).toBe('player2')
    })

    it('handles player1 through player9', () => {
      for (let i = 1; i <= 9; i++) {
        const token = `gameId-player${i}-12345678`
        expect(parsePartyIdFromToken(token)).toBe(`player${i}`)
      }
    })

    it('falls back to second-to-last part when no "player" prefix found', () => {
      const token = 'game-custom-owner-12345678'
      expect(parsePartyIdFromToken(token)).toBe('owner')
    })

    it('handles numeric partyId as fallback', () => {
      const token = 'game-1234-5678'
      expect(parsePartyIdFromToken(token)).toBe('1234')
    })

    it('handles complex tokens correctly', () => {
      const token = 'a-b-c-d-player3-1234567890123'
      expect(parsePartyIdFromToken(token)).toBe('player3')
    })
  })

  describe('buildInviteUrl', () => {
    it('builds a URL with the invite query parameter', () => {
      const url = buildInviteUrl('test-token-123')
      expect(url).toContain('?invite=test-token-123')
    })

    it('uses window.location.origin in browser environment', () => {
      // In test environment, window.location.origin might be mocked
      const url = buildInviteUrl('abc')
      expect(url).toMatch(/^https?:\/\/.*\?invite=abc$/)
    })

    it('handles empty token', () => {
      const url = buildInviteUrl('')
      expect(url).toContain('?invite=')
    })

    it('handles tokens with special characters', () => {
      const token = 'game-player1-1234567890'
      const url = buildInviteUrl(token)
      expect(url).toContain(`?invite=${token}`)
    })

    it('preserves the full token in the URL', () => {
      const fullToken = composeInviteToken('myGame', 'player2')
      const url = buildInviteUrl(fullToken)
      expect(url).toContain(fullToken)
    })
  })

  describe('parseInviteInput', () => {
    const origins = [
      'https://code-for-battle.netlify.app',
      'https://deploy-preview-42--code-for-battle.netlify.app',
      'http://localhost:5173',
      'http://127.0.0.1:4173',
      'https://example.com/play'
    ]

    it.each(origins)('reads the invite query from %s', (origin) => {
      expect(parseInviteInput(`${origin}?invite=${INVITE_CODE}`)).toBe(INVITE_CODE)
      expect(parseInviteInput(`${origin}/?invite=${INVITE_CODE}`)).toBe(INVITE_CODE)
    })

    it('accepts a trailing slash on the path or on the code', () => {
      expect(parseInviteInput(`https://code-for-battle.netlify.app/?invite=${INVITE_CODE}`)).toBe(INVITE_CODE)
      expect(parseInviteInput(`https://code-for-battle.netlify.app/play/?invite=${INVITE_CODE}`)).toBe(INVITE_CODE)
      expect(parseInviteInput(`https://localhost:5173/?invite=${INVITE_CODE}/`)).toBe(INVITE_CODE)
    })

    it('ignores extra query parameters and a hash fragment', () => {
      const url = `https://deploy-preview-7--code-for-battle.netlify.app/?utm=mail&invite=${INVITE_CODE}&ref=1#lobby`
      expect(parseInviteInput(url)).toBe(INVITE_CODE)
    })

    it('reads an invite code carried only in the hash', () => {
      expect(parseInviteInput(`https://code-for-battle.netlify.app/#invite=${INVITE_CODE}`)).toBe(INVITE_CODE)
      expect(parseInviteInput(`https://code-for-battle.netlify.app/#/?invite=${INVITE_CODE}`)).toBe(INVITE_CODE)
      expect(parseInviteInput(`https://code-for-battle.netlify.app/?utm=1#invite=${INVITE_CODE}`)).toBe(INVITE_CODE)
    })

    it('prefers the query code when the hash also has an invite', () => {
      const other = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee-player3-1710000000001'
      expect(parseInviteInput(`https://example.com/?invite=${INVITE_CODE}#invite=${other}`)).toBe(INVITE_CODE)
    })

    it('accepts a URL without a protocol and a path-only invite', () => {
      expect(parseInviteInput(`code-for-battle.netlify.app/?invite=${INVITE_CODE}`)).toBe(INVITE_CODE)
      expect(parseInviteInput(`localhost:5173/?invite=${INVITE_CODE}`)).toBe(INVITE_CODE)
      expect(parseInviteInput(`/?invite=${INVITE_CODE}`)).toBe(INVITE_CODE)
      expect(parseInviteInput(`?invite=${INVITE_CODE}`)).toBe(INVITE_CODE)
    })

    it('accepts a bare invite code', () => {
      expect(parseInviteInput(INVITE_CODE)).toBe(INVITE_CODE)
      expect(isInviteCode(INVITE_CODE)).toBe(true)
    })

    it('trims surrounding whitespace and wrapping quotes', () => {
      expect(parseInviteInput(`  \n${INVITE_CODE}\t`)).toBe(INVITE_CODE)
      expect(parseInviteInput(`  "https://example.com/?invite=${INVITE_CODE}"  `)).toBe(INVITE_CODE)
    })

    it('returns the same code from a full URL and from the code alone', () => {
      const token = composeInviteToken('game-instance', 'player1')
      expect(parseInviteInput(token)).toBe(token)
      expect(parseInviteInput(buildInviteUrl(token))).toBe(token)
      expect(parseInviteInput(`  ${buildInviteUrl(token)}  `)).toBe(token)
    })

    it('accepts a short code with any case, spaces, or dashes', () => {
      expect(classifyInviteInput('ABCDEF')).toEqual({ kind: 'short', code: 'ABCDEF' })
      expect(classifyInviteInput('  abc-def  ')).toEqual({ kind: 'short', code: 'ABCDEF' })
      expect(classifyInviteInput('ab c def')).toEqual({ kind: 'short', code: 'ABCDEF' })
      expect(parseInviteInput('ABCDEF')).toBeNull()
    })

    it('keeps a full link and a long bare token on the token path', () => {
      expect(classifyInviteInput(`https://example.com/?invite=${INVITE_CODE}`)).toEqual({
        kind: 'token',
        token: INVITE_CODE
      })
      expect(classifyInviteInput(INVITE_CODE)).toEqual({ kind: 'token', token: INVITE_CODE })
    })

    it('rejects input that is neither an invite URL nor an invite code', () => {
      expect(parseInviteInput('')).toBeNull()
      expect(parseInviteInput('   ')).toBeNull()
      expect(parseInviteInput('hello')).toBeNull()
      expect(parseInviteInput('not a code')).toBeNull()
      expect(parseInviteInput('player2')).toBeNull()
      expect(parseInviteInput('https://code-for-battle.netlify.app/')).toBeNull()
      expect(parseInviteInput('https://example.com/?foo=bar')).toBeNull()
      expect(parseInviteInput('https://example.com/?invite=not-a-code')).toBeNull()
      expect(parseInviteInput('https://example.com/#section')).toBeNull()
      expect(parseInviteInput(null)).toBeNull()
      expect(parseInviteInput(undefined)).toBeNull()
      expect(parseInviteInput(1710000000000)).toBeNull()
    })
  })

  describe('humanReadablePartyLabel', () => {
    it('formats color and owner into a label', () => {
      expect(humanReadablePartyLabel('Red', 'Player 1')).toBe('Red: Player 1')
    })

    it('handles empty strings', () => {
      expect(humanReadablePartyLabel('', '')).toBe(': ')
    })

    it('handles special characters', () => {
      expect(humanReadablePartyLabel('Blue-Green', 'AI Player')).toBe('Blue-Green: AI Player')
    })

    it('works with various color names', () => {
      expect(humanReadablePartyLabel('Blue', 'Host')).toBe('Blue: Host')
      expect(humanReadablePartyLabel('Green', 'Guest')).toBe('Green: Guest')
      expect(humanReadablePartyLabel('Yellow', 'Computer')).toBe('Yellow: Computer')
    })

    it('handles unicode characters', () => {
      expect(humanReadablePartyLabel('🔴', 'Héllo')).toBe('🔴: Héllo')
    })

    it('handles null-safe coercion', () => {
      // JS will coerce nullish values to strings
      expect(humanReadablePartyLabel(null, 'Test')).toBe('null: Test')
      expect(humanReadablePartyLabel('Red', undefined)).toBe('Red: undefined')
    })
  })

  describe('integration scenarios', () => {
    it('can compose a token and parse it back', () => {
      const gameId = 'multi-part-game-id'
      const partyId = 'player1'
      const token = composeInviteToken(gameId, partyId)
      const parsedPartyId = parsePartyIdFromToken(token)
      expect(parsedPartyId).toBe(partyId)
    })

    it('can compose a token and build its invite URL', () => {
      const token = composeInviteToken('game', 'player1')
      const url = buildInviteUrl(token)

      expect(url).toContain(token)
      expect(url).toContain('?invite=')
    })

    it('produces consistent party labels for common scenarios', () => {
      const scenarios = [
        { color: 'Red', owner: 'Human', expected: 'Red: Human' },
        { color: 'Blue', owner: 'AI Opponent', expected: 'Blue: AI Opponent' },
        { color: 'Green', owner: 'Remote Player', expected: 'Green: Remote Player' }
      ]

      scenarios.forEach(({ color, owner, expected }) => {
        expect(humanReadablePartyLabel(color, owner)).toBe(expected)
      })
    })
  })
})
