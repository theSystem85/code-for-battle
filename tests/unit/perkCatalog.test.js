import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { CAPSTONE_PERK_ID, PERKS, START_PERK_BY_VARIANT, getPerk, perksForTree } from '../../src/perks/perkCatalog.js'

describe('command perk catalog', () => {
  it('[U07275] contains the complete 36 perk, 58 star tree', () => {
    expect(PERKS).toHaveLength(36)
    expect(PERKS.reduce((sum, perk) => sum + perk.cost, 0)).toBe(58)
    expect(Object.values(START_PERK_BY_VARIANT).map(id => getPerk(id).cost)).toEqual([5, 2, 2, 3])
    expect(getPerk(CAPSTONE_PERK_ID).requires.any).toHaveLength(8)
    expect(perksForTree('unit')).toHaveLength(9)
  })

  it('[U07276] has a shipped badge for every perk', () => {
    for (const perk of PERKS) expect(existsSync(`public/${perk.badge}`), perk.id).toBe(true)
  })
})
