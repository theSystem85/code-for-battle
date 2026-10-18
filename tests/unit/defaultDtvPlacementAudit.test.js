import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { DEFAULT_SSE_SHEETS } from '../../src/ui/spriteSheetRegistry.js'

const BIOMES = ['grass', 'soil', 'sand', 'snow', 'universal']
const CATEGORIES = ['trees', 'shrubs', 'rocks', 'stones', 'farm', 'landmark', 'ruins', 'roadside', 'rare', 'shore', 'ground_detail', 'city', 'decorative']

describe('default dtv generator catalog', () => {
  it('[U01220] gives every tile and multi-tile group a generator placement path', () => {
    const offenders = []
    for (const sheetPath of DEFAULT_SSE_SHEETS.filter(path => /\/dtv[23]_/.test(path))) {
      const metadata = JSON.parse(readFileSync(`public/${sheetPath.replace('.webp', '.json')}`, 'utf8'))
      for (const [coordinate, tile] of Object.entries(metadata.tiles || {})) {
        const tags = new Set(tile.tags || [])
        const passability = ['passable', 'impassable'].filter(tag => tags.has(tag))
        if (!BIOMES.some(tag => tags.has(tag)) || passability.length !== 1 || !CATEGORIES.some(tag => tags.has(tag))) {
          offenders.push(`${sheetPath} tile ${coordinate}: ${[...tags].join(',')}`)
        }
      }
      for (const prop of metadata.propLayout || []) {
        const tags = new Set(prop.tags || [])
        if (!BIOMES.some(tag => tags.has(tag)) || !CATEGORIES.some(tag => tags.has(tag)) || ['passable', 'impassable'].filter(tag => tags.has(tag)).length !== 1) {
          offenders.push(`${sheetPath} group ${prop.id || prop.groupId}: ${[...tags].join(',')}`)
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
