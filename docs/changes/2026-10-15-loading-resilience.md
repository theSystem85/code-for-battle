- [x] **Bug: loading could remain at the asset boundary**
  Bound image load/decode, metadata fetch, browser storage and WebGPU initialization; optional asset failures now retain working sprites and use existing rendering fallbacks.
  Spec: none
- [x] **Improvement: smaller startup asset barrier**
  Defer unit sprites to a two-worker idle queue, fetch only the device density, deduplicate concurrent work, defer offline bulk downloads until playable, and split the story intro module.
  Spec: none
- [ ] **Improvement: qualifying hardware verification**
  Run full dependency-based tests and the unchanged-quality 75 FPS acceptance protocol on reference hardware before declaring performance acceptance complete.
  Spec: none

Root cause analysis: 53.3% is the WebGPU storage/backend/assets weight boundary. `Renderer.preloadTextures` previously ignored rejection of `TextureManager.preloadAllTextures`, so the texture readiness callback never ran and the enclosing `initializeGameAssets`/`Game.loadAssets` promise stayed pending. Both prepared sprite loaders also awaited image events/decode without deadlines; texture metadata fetch/body parsing and IndexedDB initialization could remain pending. These are concrete deadlock paths. The owner's particular Mac/profile trigger is not proven by the clean-profile measurements and remains to be verified there. WebGPU initialization now bounds adapter/device/shader/error-scope waits and observes device loss immediately after acquisition; the existing WebGL fallback remains active when WebGPU fails.

Only existing initial-state unit types are prepared before readiness (a fresh game starts without units). Buildings, terrain, and boot HUD assets remain critical; up to four critical prepared entries load in parallel. Remaining unit/aircraft/naval entries load after the screen hides, with producible types first. Missing prepared sprite lookups promote pending work without allocating or scanning entity lists; the existing legacy/vector rendering remains available. Image loads include decoding, and in-flight atlas sources are shared per generation. Exact 1x/2x/3x variants avoid ordinary runtime resizing; atlas cells still use the existing bitmap crop preparation. A rearmed resolution media query initiates density swaps, keeps the current registry while preparing, and rejects obsolete generations. Failed entries no longer invalidate every working sprite. Prepared manifest requests carry the app version and image requests carry the manifest asset version, preventing old CacheFirst responses from being paired with a new manifest. Idle preparation introduces a policy conflict with the older requirement to prepare every entity before gameplay; this task explicitly requests deferred preparation and on-demand fallbacks. No intentional visual-quality reduction was made.

The offline bulk manifest was independently downloading all sprite densities and original unit images, even though renderer selection chose a single variant. These image paths are now runtime-only; they were already absent from Workbox's shell precache patterns. The manifest JSON remains available offline. This means an unvisited unit/density may need a network request on its first use; runtime service-worker caching retains requested images. Full offline availability for every unused unit at every DPR is no longer promised by the bulk cache. Existing terrain source images that actually supply runtime biome descriptors are retained to preserve visuals. Offline audio/media bulk downloads wait until playable; the intro code is dynamically imported then. Hashed assets retain immutable caching; images use a one-day revalidated cache; HTML and service worker retain no-cache.

Stale malformed applied sprite metadata is ignored; persisted applied metadata is restored only for supported default static sheets with tagged tiles. Unknown custom static selections can be reselected in the editor. Saved selections are filtered through the current sheet catalog. Expired/missing image references time out and fall back. Unresponsive IndexedDB initialization cannot hold the boot barrier, and late hydration cannot overwrite defaults after its deadline. Existing numeric/map/graphics sanitizers remain in use.

Regression coverage: `tests/e2e/loadingResilience.test.js` covers normal startup, an aborted image, missing JSON, a never-answering image request, and corrupt/removed settings in both localStorage and IndexedDB. Unit coverage exercises hanging image/decode/JSON operations, failure propagation, idle queue concurrency/priority/deduplication, initial-state filtering and prepared sprite fallback publication.

Validation in this sandbox: standalone Node assertions for deadlines, failed JSON/image loads and queue deduplication passed; Node syntax checks and `git diff --check` passed. A supplemental check using the installed parser and repository style/unused-variable rules found no new code issues (the old linter lacks modern built-in globals); it does not replace ESLint 9. `npm run lint:fix:changed` failed because the offline npm cache has no ESLint package. `npm run lint` found system ESLint 6.4.0, which cannot read this repository's flat config. `npm run test:unit`, `npm run test`, and the focused Playwright command could not execute because node_modules/Vitest/Playwright are absent. No network installation was attempted. No browser timing or FPS result is claimed.

Operator commands after `npm ci`:

```sh
npm run lint:fix:changed
npm run lint
npm run test:unit
npm run test
npm run test:e2e -- tests/e2e/loadingResilience.test.js --project=chromium
npm run build
npm run preview -- --host 127.0.0.1
# In a second terminal, repeat at DPR 1, 2, and 3:
node scripts/measure-load.mjs http://127.0.0.1:4173/ 1
```

The script uses a fresh context with service workers blocked to isolate cold page assets; it reports time to hidden loading screen plus started game, requests, encoded transferred bytes (completed requests), and prepared 1x/2x/3x request counts up to playable. Repeat on the parent revision for comparison. Measure returning visits and the production service-worker path separately; background idle requests can begin near the playable observation, so compare repeated runs.

Hot-path audit: readiness/missing-sprite checks run per visible entity, typically 1–3 lookups per body/layer. At 75 FPS × 500 visible entities × 3 lookups this is about 112,500 constant-time map lookups/sec, independent of DPR; no added canvas fills or entity scans. Preparation pixel work grows with DPR squared (up to 9× at DPR 3) and is dispatched two entries per idle turn, with a 256 MiB sprite registry budget. This is a design estimate, not a measured performance certification. Use `performance_improvement.md`, `rendering_improvement_todos.md`, and `tests/e2e/renderingPipeline75Fps.test.js` for cold traversal, repeated scrolling, selected layered units, movement, firing and procedural water at realistic counts. Record backend/DPR, presented FPS, frame p95/p99/max/misses, CPU update/render, GPU timing and memory/GC evidence before/after on qualifying hardware; headless/software results cannot certify the 13.333 ms presented-frame deadline. This check remains open.

Release: 0.60.0 (minor bump), with a new versioned release-note file and regenerated APP_VERSION. No commit, push, or remote change was made.

Follow-up validation supersedes the missing-dependency limitation above: dependencies are now present, lint passes, all 5031 unit tests and all 5117 unit/integration tests pass. See `2026-10-15-loading-check-regressions.md` for the four operator-reported assertion fixes and an additional bounded first-frame GPU submission wait. Playwright remains blocked by sandbox port-binding EPERM, and qualifying-hardware acceptance remains outstanding.
