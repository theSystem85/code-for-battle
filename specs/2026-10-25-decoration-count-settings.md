# Decoration count settings

## Summary

Map Settings exposes the decoration budgets that used to be fixed intervals inside map generation. The overall decorative-tile control and the finer counts stay numerically consistent.

## Controls

| Input | Meaning | Default |
|---|---|---|
| Lakes | Lake sprites (`lake` tag, not shore props) | 110, about 30% of the legacy open-map count (365) |
| Decorative tiles | Sum of the five counts below | 34 |
| Stones | Stone sprites | 1 (3% of the previous default of 40) |
| Single trees | One-tree sprites (footprint span under 3) | 11 |
| Woods | Clustered trees drawn as one sprite (span 3 or more) | 1 |
| Other vegetation | Shrubs, bushes, flowers, reeds and similar tags | 6 |
| Ground detail | Passable ground-detail sprites | 15 |
| Wood clusters | Forest lobes the trees are drawn from | 4 |
| Wood radius | Radius of each forest lobe, in tiles | 11 |
| City density % | Scales the existing city density curve. 100 is unchanged | 100 |

The five decorative counts are the source of truth. Changing Decorative tiles scales them and keeps their ratios (a zero mix uses the legacy full-budget ratios). Changing any one of them updates Decorative tiles to the new sum. Values are clamped to the input min/max. Apply still regenerates the map; the numbers stay in sync while typing.

## Placement

- Legacy full reference, measured on an open 200×200 grass map: 40 stones, 350 single trees, 20 woods, 200 other vegetation, 485 ground details, 365 lakes.
- Defaults use `Math.round(full * 0.03)` per decorative part and `Math.round(365 * 0.3)` lakes.
- Trees and other vegetation rank shore and lake tiles first (terrain water and placed lakes). Wood-cluster centres do the same.
- Within a budget, each sprite variant is placed once (smaller footprints first) before any variant is repeated, then the remaining count fills from the best open sites. A low count therefore stays on the smaller sprites; raising it brings in the larger lakes and woods as well.
- Rock and farm variants each get one site in their cluster, largest first, before the older interval pass repeats them.
- A small share of a large single-tree budget (8%) is placed outside the density field so a few isolated trees remain.
- Stones, cities, ruins, shores and roads keep their existing passes. City density percent scales the preferred architectural tier.

## Persistence

Settings follow the existing decoration-setting path: sidebar number inputs, `rts-<key>` storage, URL query keys, saves and the host map snapshot. `GAME_STATE_SCHEMA_VERSION` is 4. Migration 4 fills any missing decoration fields without changing counts that are already stored.

Layout preparation runs when the map is built, not every frame. 75 FPS acceptance on reference hardware is still pending; this environment has no hardware GPU.
