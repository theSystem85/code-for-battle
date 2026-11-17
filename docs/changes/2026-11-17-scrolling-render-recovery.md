- [x] **Bug: Recover interrupted map rendering**
  Keep transient image/context loss from stopping frames, discard partly redrawn terrain, and restore canvas density and terrain drawing state after interruptions.
  Spec: none

## Findings

The supplied screenshot shows missing terrain and retained drawing trails. It does not provide a browser exception, memory report, or GPU crash log; the precise device failure is not proven by the image.

The initial checkout was behind current dev. It contained unbounded biome masks and delayed transition surface cleanup, but current dev already addresses those with bounded, reusable terrain canvas caches. Those existing fixes were preserved; this change does not claim them as new work.

Additional failure paths remain in current dev:

1. An `InvalidStateError` from `drawImage` escapes rendering. The game loop schedules its next frame after rendering, so that exception can leave animation stopped. The render entry point now skips a lost main context and recovers this specific transient image error so the loop continues. Other exceptions still surface. Recovery resets the backing store, including leaked clips/save stacks/transforms, restores the same DPR, and rate-limits diagnostics until rendering succeeds. It does not reset simulation or camera state.
2. A failed terrain refresh clears or partly overwrites a cached page before it completes. It can leave `everRendered` true and contaminated canvas state. Failed pages are now invalidated and their scratch backing store and resident reservation released before the error propagates; staging is released by the existing finally block. A later frame must rebuild the page.
3. Terrain base/decoration drawing changed renderer mode/grouping fields without finally cleanup. An interrupted draw could change subsequent rendering behavior. Both paths now restore their caller's fields even when drawing fails.
4. Restoring the main 2D context resets its scale. CanvasManager now listens for restoration, reacquires the context, and reapplies the existing layout/DPR transform and quality settings. Disposal removes the listener.

## Cost and validation

The added frame work is one context-loss check and an exception boundary per frame, independent of entity count and DPR. No additional per-entity work, normal-frame raster allocations, or change to visual settings. Backing-store reset occurs only on a failed frame; page invalidation occurs only on a failed bake. Finally cleanup preserves existing state assignments.

Regression coverage injects unavailable images, context loss/restoration, partially drawn pages, terrain grouping failure and decoration failure. It verifies next-camera rendering, original DPR, unchanged simulation state, released staging/resident reservations, full page rebuild, and visible programming errors.

Hardware acceptance remains pending: no verified hardware GPU is exposed in this environment. Do not run software-renderer performance benchmarks as 75 FPS evidence. On a physical iPhone and qualifying GPU hardware, cold-start the dev build, immediately pan rapidly across the full map in both directions, repeat after assets settle, and verify no trails, blank pages, reloads or stalled input. Repeat with selected layered units, combat, procedural water and realistic entity counts. Collect FPS, frame-time p95/p99/max, missed 13.333 ms deadlines, backend/DPR, CPU update/render, GPU timing and memory/GC according to performance_improvement.md.

Validation results (2026-11-17):

- `npm run test:unit`: 381 files / 5,891 tests exercised; 5,886 passed in the sandbox. Five tests in releaseScript/netlifyIgnore initially failed with `spawnSync ... EPERM`. Rerunning both files with authorized subprocess access passed all nine tests, resolving those five environment failures without code/test changes.
- Focused rendering/canvas/cache regression run: 55 tests passed. Strengthened recovery assertions were rerun separately (24 wrapper tests and 21 cache tests), all passing.
- `npm run lint:fix:changed`, `npm run lint`, `git diff --check`: passed.
- `npm run build`: passed; generated commit metadata excluded from the change.
- Hardware GPU/iPhone crash reproduction and 75 FPS acceptance: pending.
