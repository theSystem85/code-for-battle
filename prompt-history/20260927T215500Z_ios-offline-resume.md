# 2026-09-27T21:55:00Z

Grok 4.7 in Cursor Cloud Agent. Token counts were not available for this run. The task ran from 2026-09-27T21:55:00Z to about 2026-09-27T22:45:00Z.

## Prompt

iPhone standalone PWA offline cache from #720 stops around 8.2 MB and an offline relaunch does not boot. Split the Workbox precache into a fast boot shell and a resumable, versioned offline-assets cache. Serve audio with CacheFirst, cacheable 200 responses, and Range requests. Navigation must fall back to the precached shell within about 3 seconds and must not use the shell for `/api/` or `/.netlify/`. Readiness and the cache size come from an active service worker plus the Cache API counted against the expected list. Call `navigator.storage.persist()` and show it in Settings. Surface download failures with a retry. Keep the #720 behavior. Update `specs/095-offline-mode.md` and tests. Verify with a production build and Playwright on WebKit and Chromium, including an interrupted download that resumes.

## Result

- Boot shell stays in the Workbox precache. Bulk images, audio, and JSON go to `cfb-offline-assets-v1` with build-time revision hashes.
- The page downloads that list with concurrency 5, backoff, skip-if-cached, pause while offline or hidden, and resume on the next visible online launch.
- Audio is CacheFirst plus `RangeRequestsPlugin`. Same-origin `Audio` elements stay non-CORS.
- Navigations use a 3 second network timeout, then `createHandlerBoundToURL('/index.html')`.
- Settings and the sidebar tooltip show measured size and file counts, persistent-storage status, incomplete-offline warnings, and the failing URL with Retry download.
- `persist()` and `persisted()` give up after 4 seconds. A missing Storage API shows `Storage: persistence unavailable`.
- Atlas URLs keep a literal `@` (`body-atlas@2x.webp`). Encoding it as `%40` 404s on Vite preview.
- Chromium `vite preview`: offline ready at 26.8 MB · 486/486, `setOffline` + reload serves `music01.mp3` as 200 and Range 206, terrain image 200, sidebar Offline. An aborted fill resumed from 96/486 to 486/486.
- Playwright WebKit cannot navigate while `setOffline` is true. That run still filled 486/486, showed the Offline label, and read the audio and terrain bytes back from `cfb-offline-assets-v1`.
