# Impact VFX variations

## Scope and behavior

Visual-only changes in the effects renderer, the new `rendering/vfx/impactVfx.js` module, and explosion creation/call sites. Weapon damage, damage rings, splash radius, ammo, and unit configuration remain unchanged. Tank IDs: `tank`, `tank_v1`, `tank-v2`, `tank-v3` (underscore aliases accepted). No M2 definition exists in this checkout; `m2`, `bradley`, `m2Bradley`, and `bradleyM2` map to the sparky profile for integration. Generic projectile types fall back to the shooter profile.

Sparks use the reverse of projectile velocity (ballistic displacement fallback), with a wider cone for ground and a tighter cone for units/buildings. Collision call sites supply the actual surface; proximity impacts fall back to the target. A local cosmetic seed drives size, rotation, delay, lifetime, smoke shape, and particle count. It never consumes the gameplay PRNG. The explosion's gameplay radius is not modified. Existing destruction sprite sheets remain intact.

Tank impacts include a compact orange fireball/hot core, debris, embers and drifting smoke. M2 has only a tiny flash and many fast sparks. Expanding stroked explosion rings are removed. The replacement is a local, fixed 48-logical-pixel additive soft brightness pulse lasting 120–200 ms, not true refraction. Existing tile-decal counter/seed selection already varies impact artwork per hit and is preserved.

## Hot-path and preparation budget

One bounded particle pass per rendered frame; at most 384 slots, or 128 on mobile/low quality. At 75 FPS: 28,800 slot visits/sec maximum. Slots are allocated in the renderer constructor and overwritten cyclically under overload. Emission and rendering allocate no particle objects, closures, arrays, Maps or Sets. Repeated emission of the same explosion is idempotent; benchmark loop epochs can replay an effect. The original explosion's 500 ms lifetime stays unchanged; the pool independently carries smoke for up to 1.45 s plus 65 ms delay. Position uses analytic age, so simulation pause freezes effects.

The cached gradient is created before rendering at overlay DPR and drawn at its authored backing resolution (no runtime variant resizing). A single 48×48 sprite consumes `48² × DPR² × 4` bytes (147,456 bytes at DPR 4). Larger DPR disables this optional pulse rather than creating an unbounded cache. Each pulse covers at most `48² × DPR²` backing pixels and fades at low opacity. No filters, shadows, clips, full-screen blending, or range-sized fills are introduced. Particle geometry is procedural, not resized imagery.

`prepareImpactFlash(dpr)` (also exposed as `ImpactVfx.prepare`) is an explicit idempotent preparation entry point, called by destruction-effect prewarming and renderer construction. A single display-resize listener prepares and swaps the shared cache at the new overlay density. During a density mismatch the optional pulse is suppressed; ordinary rendering never builds or resizes a sprite. Peak preparation memory includes old and new sprites (at most 294,912 bytes); steady state retains one sprite. Mobile detection mirrors GameLoop's `is-touch`, `mobile-landscape`, `mobile-portrait` and `navigator.maxTouchPoints` checks. Explicit `lowEnd` or `graphicsQuality: 'low'` also reduces counts and disables the pulse; no standalone quality enum exists in this checkout.

Effects remain on the existing shared Canvas overlay for CPU, WebGL and WebGPU backends. No additional GPU context or upload path is introduced. Culling tests the drifting particle's current viewport and fog tile. The light pulse uses the same 24 px padded bounds. Canvas alpha, composition, fill/stroke and width are restored.

## Verification and performance acceptance

Required commands:

```sh
npm run lint:fix:changed
npm run lint
npm run test:unit
npm test
VITE_HEADLESS_E2E_MUTE_AUDIO=1 npm run dev -- --host 0.0.0.0
BENCH_URL=http://localhost:5173 node scripts/vfxBench.mjs
BENCH_DPR=2 BENCH_URL=http://localhost:5173 node scripts/vfxBench.mjs
BENCH_DPR=3 BENCH_URL=http://localhost:5173 node scripts/vfxBench.mjs
npx playwright test tests/e2e/explosionPreparation.test.js --project=chromium
```

`vfxBench.mjs` uses only pre-existing heavy-battle URL parameters and runtime hooks, so copy the script to main to capture a baseline. Default duration is 20 s, warmup is zero to include cold traversal, seed 11, a 100×100 map with four players, 320 units, viewport 1440×1000. `BENCH_DURATION_MS`, `BENCH_UNITS`, `BENCH_DPR`, and `BENCH_URL` are configurable. The scenario supplies camera traversal, selected units, movement and firing. Independent RAF samples produce avg/p50/p95/p99/max frame times, FPS and missed 13.333 ms deadlines. Runtime output includes phase CPU times, entity counts and actual GPU backend reports. Effective DPR and available heap samples are included; unavailable GPU timings and GC measurements are explicitly marked. Headless results never certify presented FPS.

Local live attempts: Vite failed with `listen EPERM: operation not permitted 0.0.0.0:5173`; Playwright launch failed because `chromium_headless_shell-1208` is absent. Network access is unavailable. Consequently no baseline/after FPS, CPU raster timing, GPU timings, or runtime memory measurements are claimed. Repeated full-map scrolling, cold first traversal, active worst-case VFX, water, DPR 1/2/3, WebGL/WebGPU parity, and the strict 75 FPS qualifying-hardware gate remain **open**. No resolution, detail, water cadence or rendering settings were reduced to claim a pass.

## Limitations / proposed only

- Multiplayer snapshot serializers omit the new cosmetic fields; remote snapshots render the generic profile. Protocol changes are outside the allowed write scope. Lockstep/local creation selects profiles normally.
- No M2 gameplay implementation exists to exercise in this branch; aliases are unit-tested.
- Existing decal art variants are reused; new rotation/scale needs terrain preparation changes and is deferred.
- True background refraction/blur, camera micro-shake and a toggle are not implemented.
- Visual inspection and qualifying-hardware acceptance are blocked, not marked passed.

## Local validation results

- `npm run lint:fix:changed`: passed.
- `npm run lint`: passed, no rule changes or suppressions.
- `npm run test:unit`: 278 files / 5,039 tests passed (40.19 s).
- `npm test`: 280 files / 5,125 tests passed (39.82 s).
- `node --check scripts/vfxBench.mjs`: passed.
- `git diff --check`: passed.
- `PLAYWRIGHT_SKIP_WEB_SERVER=1 npx playwright test tests/e2e/explosionPreparation.test.js --project=chromium --reporter=line`: both cases blocked at browser launch by missing Chromium, including retries. No E2E pass claimed.
- Live before/after benchmark: blocked by the server bind restriction and missing browser described above. The performance gate remains open.

Focused unit coverage includes profile fallback, collision surface and reverse travel direction, random cosmetic variation, bounded pool identity under overload, low-quality count/pulse behavior, fog/viewport culling, canvas-state restoration, no stroked explosion circles, gameplay RNG isolation, loop epochs, simulation rewind, and shared final-density cache preparation.
