export const TERRAIN_ASSET_MANIFEST = Object.freeze([
  Object.freeze({ key: 'atlas', src: 'images/terrain/organic-atlas.png' }),
  Object.freeze({ key: 'details', src: 'images/terrain/terrain-details.png' }),
  Object.freeze({ key: 'cliffs', src: 'images/terrain/terraced-cliffs.webp' }),
  Object.freeze({ key: 'biome:grass', src: 'images/terrain/source/meadow.webp' }),
  Object.freeze({ key: 'biome:soil', src: 'images/terrain/source/soil.webp' }),
  Object.freeze({ key: 'biome:snow', src: 'images/terrain/source/snow.webp' }),
  Object.freeze({ key: 'biome:sand', src: 'images/terrain/source/sand.webp' })
])

export const TERRAIN_BIOME_ASSET_KEYS = Object.freeze({
  grass: Object.freeze(['biome:grass']),
  soil: Object.freeze(['biome:soil']),
  snow: Object.freeze(['biome:snow']),
  sand: Object.freeze(['biome:sand'])
})
