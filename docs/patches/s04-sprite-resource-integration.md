# S04 sprite resource integration patch

> **Status (2026-10-26): applied in `e5936e4`** — items 2–5 landed (registry replace/remove/dispose with idempotent re-register, `runAssetJob` wrapping, explosion reservation rollback/teardown, generation-checked publication). Apache keeps shared atlas views. **Still open:** item 1 is only partly applied — the prepared registry and explosion preparation each own a `SpriteResourceStore`; TextureManager and worker adapters do not yet share one per-lifecycle store. The atlas-vs-cropped decision still needs qualifying-hardware measurements.

The S04 component is intentionally not wired into the integration-owned files. The S06 owner should make the following focused changes after the other streaming lanes land:

1. Create one `SpriteResourceStore` per prepared-rendering lifecycle and pass it to the prepared registry, texture manager, explosion preparation, and worker/scheduler adapters.
2. In `preparedSpriteRegistry.js`, register decoded source images once, expose atlas entries through `registerView`, and publish completed tiers with monotonically increasing revisions. Call `remove` before registry replacement, cancel deferred jobs before releasing their handles, and call `dispose` during registry teardown. Loader closures must release decoded-source handles once their last consumer settles rather than retaining source promises for the registry lifetime.
3. In `assetLoading.js`, wrap bitmap-producing operations with `runJob`. Supply the real abort/worker termination hook as `stop`; never publish a result until the returned promise resolves. A timeout or superseding generation then closes a late bitmap. Do not cache rejected jobs: `runJob` only deduplicates active operations and removes every settled operation.
4. In explosion preparation, reserve staging and transfer bytes before bitmap/worker creation, convert the successful result to a resident reservation, and release both temporary reservations in every completion/failure path. On worker crash or invalid dimensions, remove the failed cache entry so a later request can retry. Count-limit eviction must remove the publication/view before closing its resource. Dispose the explosion store on reset and map teardown.
5. During a density/map generation swap, retain the old publication until the new resource is fully registered, then call `publish` with a higher revision. Release staging/transfer bytes only after publication and upload handoff. This keeps old/new overlap visible in the store peak rather than hiding it in final-entry sums.

Apache should initially use shared atlas views, not 240 cropped bitmaps. Keep that decision provisional until qualifying hardware captures compare total decoded/native bytes, upload time, and steady draw cost; only switch representations when those measurements justify the extra resident resources.

No patch in this document should be applied mechanically before S06 reconciles the final S01/S05/S07 APIs.
