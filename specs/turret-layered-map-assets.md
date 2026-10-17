# Layered turret V1–V3 map assets

## Behavior

- Preserve the existing build buttons; generated map art matches their grey steel/concrete,
  round V1/V2 and angular V3 silhouettes and one/two/three south-facing guns.
- Read the building prompt template in `skills.md` and use OpenAI diffusion generation.
  Requested Image 2.5; the connected image tool exposes neither a model selector nor
  backend version metadata, so this exact-version requirement remains unverified.
- Keep a transparent foundation, independently rotating housing, and separate barrel art.
  Sources are 256×256 (foundation/housing) and 16×88 (barrel), WebP quality 85.
- Prepare final 32/64/96 pixel footprint variants for DPR 1/2/3; barrels are respectively
  2×11, 4×22 and 6×33. No source resizing or new sprite-cache construction during rendering.
  Noninteger densities continue through the existing preparation-and-swap pipeline.
- Keep a fixed 64×64 muzzle coordinate frame, independent of source resolution.
- Recoil only the fired barrel, including overlapping burst recovery. Share cubic recoil
  and the battleship white/yellow/orange muzzle flash through `turretFiringEffects.js`.
  Respect parent opacity and accept simulation timestamp zero; ignore future/expired effects.
- Preserve barrel index and elapsed shot times across multiplayer peers' simulation clocks.
  Lazily allocate one bounded shot-time array on first actual fire; preserve its identity.

## Hot-path cost and readiness

The renderer runs once per visible turret per rendered frame. With 240 visible turrets and
75 FPS, the mixed V1/V2/V3 workload is 960 sprite draws/frame (72,000/sec), versus 480 before;
all-V3 is bounded at 1,200/frame (90,000/sec). These are the independently moving layers
required for the requested animation. At DPR 3 a pixel footprint covers nine backing pixels:
240 × 75 × (2 × 32² + 3 × 2 × 11) × 9 is about 342 million sprite bounding-box pixels/sec
in the all-V3 case, before small muzzle-flash overdraw. No entity scans or per-render state
arrays/objects are introduced. There is no full-map fill, new range overlay, filter or clip.
The three gun types' active DPR-3 sprite textures account for 223,560 decoded bytes total;
all entries continue through the existing bounded registry and asset-version invalidation.

## Verification

- `npm run test:unit`: 293 files / 5,133 tests passed (initial whole-suite run).
- Focused tests cover the subsequently added independent barrel effects, peer-clock snapshot
  restoration, prepared sprite inventory/no source upscaling, and battleship rendering.
- `npm run lint:fix:changed`, `npm run lint`, and `npm run build` pass.
- `PLAYWRIGHT_BASE_URL=http://localhost:5174 npx playwright test tests/e2e/turretLayeredSprites.test.js --config=/tmp/turret-playwright.config.mjs` passed in headless system Chromium.
  The temporary config only selects `/usr/bin/chromium`, uses `--no-sandbox`, and disables
  Playwright's webserver because Vite is already running. Normal local execution is
  `npx playwright test tests/e2e/turretLayeredSprites.test.js --project=chromium`.
- The browser test spawns V1/V2/V3, observes each real burst barrel firing in sequence,
  and checks all prepared foundation/housing/barrel layers. A browser-rendered enlarged
  comparison against all three sidebar references was inspected visually.

### Scoped renderer diagnostics

Start Vite, then run sequentially from the repository root. Baseline
reads revision `dc2df60c` with `git show` and intercepts only original turret code/art
(override with `TURRET_BENCH_BASELINE_REF` if needed):

```sh
CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_BASE_URL=http://localhost:5174 TURRET_BENCH_BASELINE=1 node scripts/performance/turretSpriteBenchmark.mjs /tmp/turret-before.json
CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_BASE_URL=http://localhost:5174 node scripts/performance/turretSpriteBenchmark.mjs /tmp/turret-after.json
```

1280×800 logical Canvas2D, headless system Chromium, 240 mixed turrets, every turret firing,
120 animation frames, moving camera offset and continuous rotated headings. Raw measurements,
including cold first 30 frames, repeated frames and initial/final JS heap, are in
`docs/asset-sources/turret-render-diagnostics.json`. CPU numbers measure renderer submission;
frame numbers include scheduling/raster. GPU timing was unavailable; heap snapshots are
coarse and are not an allocation or GC trace. An unrelated focused test run overlapped the
after run's initial DPR-1 frames, so that row is noisy and cannot establish a regression.

| Run | DPR | Observed FPS | CPU p95/p99/max ms | Frame p95/p99/max ms | Missed 13.33ms |
| --- | --- | --- | --- | --- | --- |
| Before | 1 | 59.50 | 2.40/3.50/3.90 | 16.70/16.80/33.30 | 119/119 |
| Before | 2 | 33.68 | 3.80/4.80/5.00 | 33.40/50.00/50.00 | 119/119 |
| Before | 3 | 20.11 | 3.20/6.60/7.30 | 66.70/100.00/116.70 | 119/119 |
| After | 1 | 49.24 | 5.90/10.90/19.90 | 33.40/50.10/66.60 | 119/119 |
| After | 2 | 32.60 | 5.20/8.50/9.10 | 33.40/66.70/83.20 | 119/119 |
| After | 3 | 19.51 | 5.20/7.10/8.90 | 66.70/100.10/116.60 | 119/119 |

**Performance acceptance remains open.** This headless/software/display-limited diagnostic
cannot certify 75 presented FPS, and independently moving barrels add measurable submission
work. It does not exercise full-map terrain, procedural water, selected layered units and
movement together. Run the full `performance_improvement.md` reference-hardware protocol
before performance signoff: cold and repeated full-map scrolling, selected units, worst-case
active firing/movement/water, FPS, CPU/GPU timing, p95/p99/max, deadline misses and memory/GC.
Do not treat the checks here as that signoff or lower quality/resolution to pass it.
