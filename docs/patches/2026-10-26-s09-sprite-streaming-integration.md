# S09 sprite streaming integration proposal

> **Status (2026-10-26): items 1, 2 and 4 applied** in `91c2951` / `bc22782` (content-addressed tier page URLs, TextureManager overlap loads at concurrency 2 without source+derivative double requests; the downloader already provides the background `waitForDownloadSlot` fallback). **Still open:** item 3 — `cacheSelectedOfflineSpriteRepresentations()` exists and is unit-tested but is not yet called by the runtime/service worker (tier pages are instead excluded from the bulk offline manifest and stay demand-driven). The browser verification list below has not been run.

The S09-owned PWA code is ready, but the frozen ownership boundary prevents applying the remaining consumer wiring in this lane.

## Integration-owner changes

1. When the derivative manifest is produced, give every manifest and image request the same build-time content identity with `createImmutableSpriteDerivativeUrl()`. The identity must cover source bytes, metadata, preparation algorithm, tier, and density. Do not add mutable editor/source sheets to this route.
2. In the sprite streaming scheduler, pass only the chosen coarse and final representations for the active density to `loadSpriteSheetsWithOverlap()`. Keep its default concurrency of two unless the S04/S05 byte reservations permit a smaller value. Do not enqueue the source when a derivative is selected.
3. After the active density and final tier are known, pass manifest entries through `selectOfflineSpriteRepresentations()`. Cache the returned entries in the derivative cache, then call the existing stale-entry cleanup with that exact selected list. Do not add every derivative tier to the bulk offline manifest; its emitted `spritePolicy.automaticDerivativeDownload` intentionally remains `false`.
4. Provide a visible-request barrier as `waitForDownloadSlot` if the scheduler can expose one. The downloader already falls back to `scheduler.postTask(..., { priority: 'background' })`, so browsers with the Scheduling API let visible work run first.

## Required integration verification

- Warm online, forced-offline, and redeploy runs must resolve the manifest and imagery from one content identity.
- Verify coarse offline rendering and the selected final tier at the active density; do not infer coverage from the bulk manifest.
- Confirm the derivative selection stays within 128 MiB and the runtime derivative cache stays within 96 entries after density/tier upgrades.
- Confirm no source-plus-derivative or all-density request amplification in the network trace.
