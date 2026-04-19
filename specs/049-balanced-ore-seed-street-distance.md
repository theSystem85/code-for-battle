# 049 - Balanced ore seed crystal street distance and ore distribution tiers

## Summary
Map generation must keep early-economy access fair while adding richer ore distribution. Every party gets consistent near-base access when enough ore fields exist, center-focused fields when scarce, and additional deterministic spread fields when abundant.

## Functional requirements
- Provide a sidebar map-settings input for ore field count (`mapOreFieldCount`) that supports values from 0 to 24 and is persisted in local settings.
- Provide a sidebar map-settings input for total seeded ore value (`mapOreTotalValue`) that supports value steps of `1000` (one density-1 crystal / one base harvester load), is persisted in local settings, and defaults to `64000`.
- Remove reliance on a shuffle button by regenerating the map immediately whenever any map feature input changes (`seed`, `players`, `width`, `height`, `ore field count`).
- Ensure map generation is deterministic for the same seed and map settings.
- Ensure each generated ore field has one seed crystal in its center with regular ore around it.
- Distribute the configured total ore value evenly across generated seed crystals by allocating non-seed crystal density in 1000-value units; with total ore value `0`, only seed crystals are generated.
- Distribution rules by Ore Field Count (OFC):
  - If `OFC < number of parties`, all ore fields are placed around the center of the map.
  - If `OFC == number of parties`, each party gets one near-base ore field.
  - If `OFC == number of parties + n`, the next `n` fields are added around the center, capped at 4 center fields in total.
  - Any additional fields beyond that cap are placed as spread/random fields across the map.
- Keep near-base fairness behavior when near fields exist: each party near-base seed crystal should remain around 24-36 street tiles from its base and be street-reachable.
- Keep default ore spread interval 3x slower than previous baseline.

## Acceptance criteria
1. Given `OFC=0`, map generation produces zero seed crystals and no ore fields.
2. Given `OFC < parties`, all generated fields are center-distributed (no required near-base fields).
3. Given `OFC == parties`, each party has one near-base ore field.
4. Given `OFC > parties`, up to 4 total center fields are used before additional fields become spread/random.
5. Given unchanged seed + map settings, regenerated maps are identical.
6. Given changed seed with same map settings, ore field layout changes.
7. Given `mapOreTotalValue=0`, generated maps contain only seed-crystal ore tiles (no additional non-seed ore tiles).
8. Given `mapOreTotalValue=N`, total non-seed ore value equals `N` in 1000-value increments and is distributed evenly per seed cluster (difference at most one 1000-value step between clusters when `N` is not divisible by seed count).
7. Given changes to any map feature input, map regeneration occurs immediately without pressing a shuffle button.

## Validation
- Add and run a Playwright E2E test that verifies OFC=0 support, OFC distribution tiers (center/near/spread), deterministic regeneration, and immediate map regeneration from map-settings input changes.
