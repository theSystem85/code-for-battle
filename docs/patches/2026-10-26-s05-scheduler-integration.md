# S05 scheduler integration proposal

The S05 scheduler is intentionally not wired into integration-owned rendering, camera, startup, or prepared-registry modules in this lane.

The integration owner should:

1. Create one `createIdleAssetQueue` and one `createSpriteStreamingScheduler` for the active prepared registry.
2. Build one coalesced camera-demand snapshot per camera revision, outside entity render loops, and pass its preallocated demand arrays to `scheduler.update()`.
3. Use `requestCritical()` for readiness-blocking assets requested before the first camera snapshot.
4. Stop calling `preloadRemaining()` with every deferred manifest entry. Submit only visible coarse, directional lookahead, visible refinement, and explicitly optional resident-policy candidates.
5. Provide a foreground-slack predicate based on measured frame headroom. Do not interpret the timer fallback itself as idle time.
6. Advance asset, map, or density generations at their existing lifecycle boundaries so stale queued and late-running work is rejected.

This proposal is documentation only; no integration-owned path was changed by S05.
