import { expect, it } from 'vitest'
import { toggleSpriteTag } from '../../src/ui/sseTags.js'

it('tags and untags every tile of an imported sprite, including partial existing tags', () => {
  const sprite = { placedAt: { column: 1, row: 2 }, tileSpan: { columns: 2, rows: 2 } }
  const data = { tiles: { '1,2': { tags: ['tree', 'forest'] } }, extension: { imports: [sprite] } }
  expect(toggleSpriteTag(data, 2, 3, 'tree')).toHaveLength(4)
  for (const key of ['1,2', '2,2', '1,3', '2,3']) expect(data.tiles[key].tags).toContain('tree')
  toggleSpriteTag(data, 1, 2, 'tree')
  expect(data.tiles).toEqual({ '1,2': { tags: ['forest'] } })
  expect(sprite.tags).toEqual(['forest'])
})
