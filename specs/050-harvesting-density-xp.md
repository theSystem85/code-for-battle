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
4. Harvester XP stars are money-delivered based:
   - 1 star at 10,000
   - 2 stars at 30,000
   - 3 stars at 50,000
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
10. Crystal sprite sheet `crystals_q90_1024x1024.webp` should be available in static sheet selection defaults.
