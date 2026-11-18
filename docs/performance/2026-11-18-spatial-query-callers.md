# Spatial query caller samples

The fixed-tick replay ran 150 updates from the loaded 500-unit fixture with frame scheduling held during import and seeded randomness. The Apple M1 hardware GPU and active display were verified. It recorded 138,571 ground and air spatial queries and sampled a JavaScript stack at every 50th query. A second run sampled every 47th query. These periodic samples can alias the deterministic call order and indicate call frequency, not per-caller CPU time.

| Caller | Every 50th query | Every 47th query |
| --- | ---: | ---: |
| `resolveUnitCollisions` in `src/units.js` | 1,325 | 1,417 |
| Ground `checkUnitCollision` in `src/game/movementCollision.js` | 1,308 | 1,393 |
| Air `checkUnitCollision` | 131 | 132 |
| `calculateCollisionAvoidance` | 7 | 6 |
| Total sampled | 2,771 | 2,948 |

Both captures recorded 150 rebuilds, 3,370,623 recursive node visits, 2,541,848 candidate units and 190,874 results. Their selected-state start and end hashes matched the [fixed-tick baseline](2026-11-18-fixed-tick-replay.md). This does not prove equivalence of all game state, and stack collection adds significant overhead. The two collision paths dominate sampled call frequency in this fixture. A follow-up should measure each path's own time and consider whether its queries can share valid data without changing movement order, domain separation, center-based occupancy or self-exclusion.

```sh
for every in 50 47; do
  BENCHMARK_URL=http://127.0.0.1:4192 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_FIXED_TICKS=150 BENCHMARK_COUNT_SPATIAL=1 BENCHMARK_SPATIAL_STACK_EVERY=$every BENCHMARK_OUTPUT=tmp/unit-heavy/spatial-caller-$every node scripts/performance/fixed-tick-replay.mjs
done
```
