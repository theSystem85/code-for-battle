// Larger areas are assembled from normal-scale crowns/boulders and wider
// water, rather than enlarged individual trees or stones. Bounds are atlas
// pixels (64px pitch), rendered at half size on the 32px game grid.
const entries = [
  ['broadleaf_copse', 164, 132, 'trees impassable'],
  ['birch_stand', 188, 156, 'trees impassable'],
  ['woodland_clearing', 216, 172, 'trees impassable'],
  ['mixed_grove', 248, 188, 'trees impassable'],
  ['willow_copse', 176, 144, 'trees impassable'],
  ['pine_log_grove', 208, 164, 'trees impassable'],
  ['curved_clearing', 252, 204, 'trees impassable'],
  ['dense_woodland', 300, 236, 'trees impassable'],
  ['reed_pond', 188, 156, 'water lake impassable'],
  ['rocky_pond', 216, 172, 'water lake impassable'],
  ['kidney_lake', 248, 188, 'water lake impassable'],
  ['long_woodland_lake', 192, 252, 'water lake impassable'],
  ['crescent_lake', 248, 224, 'water lake impassable'],
  ['twin_lobed_lake', 300, 224, 'water lake impassable'],
  ['island_lake', 316, 248, 'water lake impassable'],
  ['broad_shallow_lake', 372, 380, 'water lake impassable'],
  ['granite_boulders', 104, 84, 'rocks impassable'],
  ['limestone_shelves', 116, 84, 'rocks impassable'],
  ['basalt_formation', 100, 76, 'rocks impassable'],
  ['sandstone_slabs', 120, 84, 'rocks impassable'],
  ['river_stone_patch', 56, 44, 'rocks stones passable'],
  ['mossy_boulders', 112, 88, 'rocks impassable'],
  ['low_rocky_ridge', 168, 100, 'rocks impassable'],
  ['fieldstone_formation', 156, 104, 'rocks stones passable']
]

export const LARGE_NATURE_PROFILES = ['grass', 'soil'].map(biome => ({
  source: `woodland_lakes_stones_${biome}`,
  name: `dtv7_nature_${biome}_large`,
  kind: 'props', layoutVersion: 1, biomes: [biome],
  seasons: [biome === 'grass' ? 'summer' : 'autumn'],
  sourceColumns: 4, expectedSprites: 24,
  detection: { transparent: true, alphaCutoff: 128, gap: 0, minArea: 1000 },
  // These source illustrations fit many trees in each small source cell.
  // Offline ratios above 1 restore their crowns to the same world scale as
  // the established trees; the actual map display remains near source pixels.
  maxImportScale: 2,
  props: entries.map(([name, width, height, categories]) => ({
    name, tags: categories.split(' '), referenceSize: { width, height }
  }))
}))
