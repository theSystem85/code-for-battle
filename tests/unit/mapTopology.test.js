import { describe, it, expect } from 'vitest'
import { computeMapTopologyFingerprint, topologyChangesAllowed } from '../../src/game/mapTopology.js'

const sheet = (sheetPath, tags = ['decorative', 'impassable', 'grass']) => ({
  sheetPath, metadata: { tiles: { '0,0': { tags }, '1,0': { tags: ['grass'] } } }
})
const fingerprint = sheets => computeMapTopologyFingerprint({ enabled: true, sheets })

describe('map topology fingerprint', () => {
  it('[U02716] ignores sheet, tile-key and tag order without mutating input', () => {
    const a = sheet('a.webp')
    const b = sheet('b.webp')
    const original = JSON.stringify(a)
    const reordered = { ...a, metadata: { tiles: { '1,0': a.metadata.tiles['1,0'], '0,0': { tags: [...a.metadata.tiles['0,0'].tags].reverse() } } } }
    expect(fingerprint([a, b])).toBe(fingerprint([b, reordered]))
    expect(JSON.stringify(a)).toBe(original)
  })
  it('[U02717] changes for tags, selection and each decoration setting', () => {
    const sheets = [sheet('a.webp')]
    const original = fingerprint(sheets)
    expect(fingerprint([sheet('a.webp', ['decorative', 'passable', 'grass'])])).not.toBe(original)
    expect(fingerprint([...sheets, sheet('b.webp')])).not.toBe(original)
    for (const key of ['citySeeds', 'cityClusterSize', 'ruinSeeds', 'ruinClusterSize']) {
      expect(computeMapTopologyFingerprint({ enabled: true, sheets, [key]: 4 })).not.toBe(original)
    }
  })
  it('[U02718] keeps explicit empty custom selection equivalent to disabled mode', () => {
    expect(fingerprint([])).toBe('default')
    expect(computeMapTopologyFingerprint({ enabled: false, sheets: [sheet('a.webp')] })).toBe('default')
  })
  it('[U02719] blocks client edits and all mid-match multiplayer edits', () => {
    const multiplayerSession = { isRemote: true, localRole: 'client' }
    expect(topologyChangesAllowed({ multiplayerSession })).toBe(false)
    expect(topologyChangesAllowed({ multiplayerSession }, true)).toBe(true)
    expect(topologyChangesAllowed({ multiplayerSession, gameStarted: true }, true)).toBe(false)
    expect(topologyChangesAllowed({ gameStarted: true })).toBe(true)
  })
})
