# Spec 050: Harvesting density + harvester XP progression

## Goal
Implement crystal density-driven harvesting where ore/seed crystals support density levels `1..5`, with harvest value and harvester eligibility gated by harvester star level.

## Requirements
1. Ore and seed crystals carry explicit density state (`oreDensity`, `seedCrystalDensity`) in runtime and save/load snapshots.
2. Harvester harvesting permissions:
   - 0 stars: can harvest density 1-2.
   - 1 star: can harvest up to density 3.
   - 2 stars: can harvest up to density 4.
   - 3 stars: can harvest up to density 5.
3. Harvest value scales by density (density 5 yields 5x base value).
4. Harvester XP stars are unload-progress based:
   - each unload grants XP proportional to the delivered fraction of a full cargo
   - 10 full unload equivalents fill the XP bar and grant +1 star
   - XP resets after each promotion until 3 stars are reached
5. Harvester star upgrades:
   - +50% cargo capacity per star level.
   - +25% armor at 2 stars and above.
   - +25% movement speed at 3 stars.
6. Ore tile visuals track density while being harvested/depleted (density reduces as ore is harvested).
7. Ore spread behavior:
   - On a spread tick, all 4 orthogonal neighbor tiles are processed.
   - Empty valid tiles become ore density 1.
   - Existing ore neighbors increase density by 1 up to max 5.
8. Seed crystal spread rate scales with seed density (density multiplier `1x..5x`).
9. Seed crystal density is deterministic from map seed RNG during map generation.
10. Generated ore-field density must fall off with distance from each field's seed crystal so richer ore visually radiates outward from the seed in deterministic bands.
11. Crystal sprite sheet `crystals_q90_1024x1024.webp` must be used as the default ore/seed tagged runtime source even when `Custom sprite sheets` is disabled, and it must not require inclusion in the `sprite sheets to use` checklist.
12. Selected harvesters show their XP bar in the shared bottom progress slot used by other units, while harvester cargo/load uses the ammo-side HUD bar to avoid overlap.
13. Seed crystals should resolve integrated-sheet sprites from `red` + `density_X` tags even when those tiles no longer carry the legacy `ore` tag.
14. If `Custom sprite sheets` is enabled and selected sheets provide matching crystal tags, those selected custom tags override bundled crystal defaults.
15. When crystal overlays are rendered from tagged sheets, the tile underneath must still render a deterministic random passable ground tile from the currently selected biome tag so transparent crystal pixels reveal biome-consistent terrain.
