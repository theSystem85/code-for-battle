// Reviewed reading order, one name and placement contract per extracted silhouette.
const props = (names, categories) => names.split('|').map((name, index) => ({ name, tags: categories[index].split(' ') }))
const T = 'trees impassable', F = 'farm passable', R = 'rocks impassable', S = 'rocks stones passable', X = 'ruins impassable', D = 'roadside impassable', W = 'water impassable'
const decor = {
  grass: props('reed_pond|poplar_row|ruined_chapel|broad_oak|bushes|birches|oak_copse|wooden_shed|farmstead|hay_cart|stone_well|hedgerow|mossy_boulders|hay_bales|fallen_trunk|saplings|haystack|beehives|apple_orchard|vegetable_garden|windmill|tool_shed|broken_arch|mossy_logs', [W+' landmark',T,X,T,T,T,T,F,F+' landmark',F,F,F,R,F,'passable',T,F,F,F,F,F,F,X,'passable']),
  soil: props('ruined_farmstead|autumn_grove|dead_tree_row|muddy_pond|log_pile|watchtower|pumpjack|dead_tree|autumn_tree|fence_plough|water_tank|collapsed_shed|thornbush|rusty_tractor|wheelbarrow|stone_well|scarecrow|tree_stumps|loose_stones|grain_silo|bare_orchard|hay_wagon|brick_kiln|irrigation_trough', [X+' landmark',T,T,W,F,X,X,T,T,F,D,X,T,D,F,F,F,'passable',S,F,F,F,X,F]),
  sand: props('palm_row|oasis|saguaros|adobe_hut|sandstone_arch|dune|car_wreck|mudbrick_ruin|sandstone_outcrop|palm|truck_wreck|tent_camp|dry_shrubs|barrel_cacti|loose_boulders|skull_bones|skeleton|dead_tree|stone_well|barrels|acacia|ruined_cistern|dry_wash|water_tank', [T,W+' landmark',T,F,X,'passable',D,X,R,T,D,F,T,T,S,'passable','passable',T,F,D,T,X,R,D]),
  snow: props('frozen_stream|pine_grove|ruined_house|frozen_pond|log_cabin|frozen_lake|boulder|expedition_tent|pine|spruces|rock_ridge|car_wreck|frosty_shrubs|loose_stones|iron_tank|ice_chunks|supplies_sled|firewood|crates|bare_birch|bare_oak|larch|snowy_bush|weather_mast', [W+' frozen_lake',T,X,W+' frozen_lake',F,W+' frozen_lake landmark',R,F,T,T,R,D,T,S,D,R,F,F,D,T,T,T,T,X]),
  universal: props('wall_ruin|village_block|house_ruin|water_tower|fuel_depot|truck_convoy|tank_hulk|pillbox|containers|sandbags|car_wreck|crates|tires|barrels|cable_drums|iron_tank|rubble|girders|generator|concrete_steps|brick_chimney|collapsed_cart|checkpoint|machinery', [X,X+' landmark',X,X+' rare',X+' rare',D,X,X,D,X,D,D,D,D,D,D,X,X,D,X,X,X,X,D])
}
// Physical farm structures block movement; crops, tools and loose hay do not.
const farmStructures = new Set(['wooden_shed', 'farmstead', 'stone_well', 'windmill', 'tool_shed', 'grain_silo', 'adobe_hut', 'tent_camp', 'log_cabin', 'expedition_tent'])
for (const entries of Object.values(decor)) for (const prop of entries) {
  if (farmStructures.has(prop.name)) prop.tags = prop.tags.filter(tag => tag !== 'passable').concat('impassable')
}
const natureNames = 'oak|beech|chestnut|ash|elm|birch|poplar|maple|willow|young_oak|pine|spruce|fir|larch|scots_pine|leafy_bush|bramble|hawthorn|hazel|gorse|birch_saplings|pine_saplings|ferns|tall_grass|wildflowers|granite|limestone|basalt|sandstone|layered_rocks|river_stones|slate_stones|mossy_stones|pebbles|pale_stones|reed_pond|woodland_pond|lily_pond|rocky_lake|wetland_pond'
const nature = props(natureNames, Array.from({ length: 40 }, (_, i) => i < 22 ? T : i < 25 ? 'shrubs passable' : i < 30 ? R : i < 35 ? S : W+' lake'))
const shoreNames = 'cattails|flowering_reeds|bent_reeds|dense_cattails|green_reeds|dry_reeds|flowering_sedge|rushes|grass_hummock|bank_rushes|broadleaf_sedge|dry_hummock|mossy_rocks|sandstone_pebbles|river_pebbles|slate_chips|pale_rocks|granite_bank|driftwood|broken_pier|jetty|fishing_hut|boathouse|bank_planks|lily_pads|water_lilies|pond_leaves|floating_log|rowing_boat|skiff|weathered_stump|snowy_reeds|snowy_rocks|icy_driftwood|snowy_grass|ice_rubble'
const shore = props(shoreNames, Array.from({ length: 36 }, (_, i) => `shore ${i >= 24 && i <= 29 ? 'offshore' : i >= 19 && i <= 22 ? 'shore_trans' : 'onshore'} ${i === 21 || i === 22 ? 'impassable' : 'passable'}${i >= 12 && i <= 17 || i === 32 || i === 35 ? ' rocks stones' : ''}`))
shore.forEach((prop, i) => { prop.biomes = i < 6 || i >= 24 && i <= 26 ? ['grass', 'soil', 'sand'] : i < 12 ? ['grass', 'soil'] : i >= 31 ? ['snow'] : ['universal']; if (i >= 31) prop.tags.push('winter') })
export const CURATED_PROFILES = [
  ...Object.entries(decor).map(([biome, entries]) => ({ source: `alpha_${biome}`, name: `dtv6_decor_${biome}`, biomes: [biome], seasons: biome === 'snow' ? ['winter'] : [], props: entries, sourceColumns: 4, detection: { transparent: true, alphaCutoff: 128, gap: 0, minArea: 1000 } })),
  { source: 'alpha_shore', name: 'dtv6_shore', biomes: ['universal'], props: shore, sourceColumns: 6 },
  ...['grass', 'soil'].map(biome => ({ source: `alpha_nature_${biome}`, name: `dtv6_nature_${biome}`, biomes: [biome], seasons: [biome === 'grass' ? 'summer' : 'autumn'], props: nature, sourceColumns: 5,
    detection: { transparent: true, alphaCutoff: 128, gap: 0, minArea: 1000 } }))
].map(profile => ({ kind: 'props', layoutVersion: 1, detection: { transparent: true, alphaCutoff: 16, gap: 0, minArea: 1000 }, ...profile, expectedSprites: profile.props.length }))
