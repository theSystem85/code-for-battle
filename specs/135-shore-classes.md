# Sparse coastal decorations

Every shore sprite carries `shore` and exactly one of `onshore`, `offshore`, `shore_trans`. Reeds and lilies support grass, soil and sand; grassy mounds support grass and soil. Other reviewed shore art is universal.

Prepare one seeded attempt per 14 decoratable coast anchors. Cycle candidates through seeded bags and retain normal footprint spacing, including six-tile identical-sprite separation. Keep roads and their buffers, resources, buildings and protected starts clear.

Onshore footprints occupy land and touch water in the eight-neighborhood. Offshore footprints occupy only water within one tile of decoratable land. Crossing 2x1 art starts on land and ends on cardinally adjacent water, rotating by 0/90/180/270 degrees and transposing its footprint for vertical placement. Source offsets rotate with the footprint, so rotating each cell about its center is equivalent to rotating the composed sprite about its footprint center. Only the land part contributes optional impassability; water decorations do not change gameplay tile types or water occupancy.

All layout work runs during preparation. Rotation introduces three canvas transform operations plus save/restore per visible rotated cell during terrain chunk baking, with the same one image blit per cell. For a 60-tile coast this is typically four props (at most eight crossing cells). Raster area is unchanged: each cell covers 32² × effective DPR² pixels (4096 at DPR 2). No source-image resizing, per-entity work, per-frame entity scans, caches or range-sized fills are added.

Validation: `npm run test:unit`, `npm run lint:fix:changed`, `npm run lint`; parity: `npm run test:e2e -- tests/e2e/emptyCustomSheets.test.js --project=chromium --reporter=line`.

Qualifying hardware verification remains open: cold traversal, repeated map scrolling, selected layered units, firing, movement, procedural water and realistic entity counts at unchanged settings must sustain 75 presented FPS. Record FPS, frame p95/p99/max, >13.333 ms deadlines, CPU update/render, GPU timing, backend/DPR and memory/GC per performance_improvement.md. This sandbox cannot certify those results.

Local results (2026-10-17): all 5,080 unit tests in 282 files passed; both required lint commands passed. Unit coverage includes 60-tile coasts for all three classes, both axes and all land-end directions, deterministic placement and spacing, metadata/compiler parity, water passability, rotation draw calls and edited-map invalidation. Browser parity could not start because listening on 127.0.0.1:5173 fails with EPERM; its test file remains unchanged.
