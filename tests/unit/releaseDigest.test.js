import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeBoot, createReleaseDigest, getBootReleaseDigest, getHighlightIndex,
  getLoadingHighlights, getManualReleaseDigest, getReleaseDigest,
  LAST_DURATION_KEY, LAST_VERSION_KEY
} from '../../src/ui/releaseDigest.js'
import { APP_VERSION } from '../../src/version.js'

beforeEach(() => localStorage.clear())
const entries = [
  { version: '0.9.0', features: ['Old'] },
  { version: '0.10.0', features: ['First', 'Second'], improvements: ['Faster'], bugfixes: ['Fixed'] },
  { version: '0.11.0', features: ['Third'], bugfixes: ['Another fix'] },
  { version: '0.12.0', features: ['Future'] }
]

describe('release digest', () => {
  it('includes all skipped releases, excluding the previous and future versions', () => {
    const digest = getReleaseDigest('0.9.0', '0.11.0', entries)
    expect(digest.features).toEqual(['First', 'Second', 'Third'])
    expect(digest.improvements).toEqual(['Faster'])
    expect(digest.bugfixes).toEqual(['Fixed', 'Another fix'])
  })

  it('prioritizes features and falls back to improvements and fixes', () => {
    const digest = getReleaseDigest('0.9.0', '0.11.0', entries)
    expect(getLoadingHighlights(digest)).toEqual(digest.features)
    expect(getLoadingHighlights({ ...digest, features: [] })).toEqual(['Faster', 'Fixed', 'Another fix'])
  })

  it('distributes rows evenly over the previous measured loading duration', () => {
    expect([0, 999, 1000, 2000, 3000, 9000].map(ms => getHighlightIndex(ms, 3000, 3))).toEqual([0, 0, 1, 2, 2, 2])
    expect(getHighlightIndex(100, 3000, 0)).toBe(-1)
  })

  it('uses the same component for full category lists and a single loading line', () => {
    const digest = getReleaseDigest('0.9.0', '0.11.0', entries)
    const full = createReleaseDigest(digest).root
    expect(full.querySelectorAll('li')).toHaveLength(6)
    expect(full.textContent).toContain('Update v0.9.0 → v0.11.0')
    const compact = createReleaseDigest(digest, { compact: true })
    compact.update(0)
    expect(compact.root.textContent).toContain('3 new features · 1 improvements · 2 bugfixes')
    expect(compact.root.textContent).not.toContain('Faster')
    compact.update(2)
    expect(compact.root.querySelector('.release-digest__highlight').textContent).toBe('Third')
    expect(compact.root.querySelectorAll('li')).toHaveLength(0)
  })

  it('records successful device loading duration and retains the diff in the manual', () => {
    localStorage.setItem(LAST_VERSION_KEY, '0.46.0')
    const digest = getBootReleaseDigest()
    expect(digest.fromVersion).toBe('0.46.0')
    completeBoot(4321.4, digest)
    expect(localStorage.getItem(LAST_VERSION_KEY)).toBe(APP_VERSION)
    expect(localStorage.getItem(LAST_DURATION_KEY)).toBe('4321')
    expect(getBootReleaseDigest()).toBeNull()
    expect(getManualReleaseDigest().fromVersion).toBe('0.46.0')
  })

  it('works when persistent storage is denied', () => {
    const spy = vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => completeBoot(2000, null)).not.toThrow()
    spy.mockRestore()
  })
})
