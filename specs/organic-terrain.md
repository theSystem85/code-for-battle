# Organic terrain rendering

Default terrain now uses an offline-generated atlas. Gameplay tile types, blocked cells, pathfinding, collisions, map serialization, and minimap colors are unchanged. Explicit integrated/custom spritesheet mode retains its original art. Turning textures off or failing to load the new atlas preserves the existing fallback.

## Assets and rebuild

Run `npm run make:terrain`. Requires the existing `sharp` dependency; no API key or network needed. Commit the generated PNG/JSON and both source PNGs. Assets live in `public/images/terrain/`. Runtime downloads only `organic-atlas.png` (~2.25 MiB compressed; 1280x2032 RGBA, 9.9 MiB decoded). Source images are retained for reproducibility but never loaded by the game.

Built-in OpenAI imagegen produced `source/materials.png` and `source/rocks.png`. Prompts: (1) two equal panels of muted olive fine grass and weathered dark gray compact gravel/asphalt, seamless top-down grounded classic RTS material, diffuse lighting, no markings, objects, text or framing; (2) transparent 3x2 formation sheet containing cluster, horizontal ridge, diagonal ridge, corner, endcap and large mass, upper-left lighting, weathered stone with gravel and moss, isolated cells, no square ground patches, labels or borders. Original generated outputs are retained as sources. `build-terrain.mjs` crops, packs, and bakes masks using sharp and deterministic arithmetic, never runtime pixel compositing.

## Selection and layering

Cardinal bits N/E/S/W = 1/2/4/8; NE/SE/SW/NW = 16/32/64/128. A diagonal is kept only if both incident cardinal neighbors connect. This produces the complete 47-mask blob table. Each mask has four coordinate-hashed material variants; missing sides and corners have pre-baked curved, noisy alpha edges. Four additional exterior wedges bridge diagonal stairs on adjacent grass; runways are excluded. Disconnected road cells have rounded caps.

Grass uses two sets of 64 continuous 64px source regions over an eight-cell period with periodic macro color variation baked into the texture. Road interior variation is deterministic. Reflected source sampling keeps material edges compatible. Eight-cell blocks select normal/drier macro materials by coordinate hash with matching boundary colors. Fine detail still has a finite repeat, so very large empty areas can reveal repetition.

Rocks are transparent silhouettes selected by topology. Aligned occupied 2x2 regions share one large mass, eligible pairs share a ridge/cluster, and remaining blocked cells get a small cluster/corner/endcap. Deterministic position choices break repetition. All four formation footprints are pre-resized offline to exact 43/75px dimensions, avoiding runtime sprite resampling and cache sampling differences. No logical cells are mutated. Silhouettes overlap adjacent cells; two-cell bake halos and signature halos preserve formations across chunk boundaries and edits.

Base grass/water -> road overlays -> rock formations -> existing combat decals and resources -> existing entities/fog. Water rendering and custom integrated spritesheets retain their original paths. Texture load completion invalidates chunk caches once. Chunk size, maximum cache count, raster resolution and per-frame chunk blits remain unchanged. Added selection, alpha blending and grouping execute on cache rebuilds, not per entity or simulation tick. Signatures inspect a two-cell halo (20x20 versus 18x18 cells for interior chunks). One atlas and fewer rock sprite draws amortize bake costs; no shader/filter/gradient/clip was added to a frame path.

## Validation and performance

Commands:
- `npm run make:terrain`
- `npm run test:unit`
- `npm run lint:fix:changed`
- `PLAYWRIGHT_SKIP_WEB_SERVER=1 TERRAIN_BENCHMARK=1 TERRAIN_BASELINE_FPS=41.36 npx playwright test tests/e2e/organicTerrain.test.js --project=chromium --workers=1`
- `npm run build`

The browser test compares every RGBA channel of direct rendering against four stitched cached chunks, then repeats after editing a boundary cell. It also confirms rendering does not mutate the logical grid. Unit tests cover all 256 input neighborhoods/47 canonical masks, runway exclusions, deterministic variants and shared rock masses.

Measured locally in Headless Chromium 145 on macOS, 1440x1000 viewport, DPR 2 (2380x2000 terrain backing canvas), seed 4, 100x100 map, existing combat benchmark with scrolling at 8px/frame, 15-second sampling. Original -> updated performance monitor: 41.36 -> 40.39 FPS (-2.3%); update 2.68 -> 2.75 ms; render 6.37 -> 6.77 ms; terrain 5.19 -> 5.64 ms; end heap 73.05 -> 61.04 MiB; slow CPU-work frames 5 -> 4. Final viewport used twelve cached chunk hits and zero direct tile passes. These are single-run observations, not guaranteed improvements: simulation timing and camera position vary, and heap snapshots do not establish GC absence. The unchanged game falls below 60 FPS in this headless environment too; hardware/mobile 60 FPS is not certified. The regression test enforces an explicitly configurable floor and an 80% baseline ratio.

Final validation: 159 unit test files / 3,876 tests passed; both focused Chromium tests passed; required changed-file lint and production build passed. A prior development sample measured 45.31 FPS; the final sample above is the authoritative reported result. This demonstrates the configured regression gate, not a guarantee of equal-or-better FPS on every device.
