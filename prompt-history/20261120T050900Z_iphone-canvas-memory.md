# 2026-11-20T05:09:00Z

Model: Grok 4.7
Harness: Cursor Cloud Agent

## Prompt

Patrick approved PR #806. On the same branch, find and fix why the dev site became unstable on his iPhone 13 Pro Max (iOS Chrome / WebKit): crashes, rendering glitches, and shorelines not drawn. The deploy preview of this branch is fine on the same phone. Dev serves 17160541 and the preview serves that commit plus the audio-catalogue commits, so the game code matches. The runtime differences are the v3 sound effects playing by default on dev, and persisted state on the dev origin (service worker, IndexedDB, graphics settings, live-update snapshots, prepared map sprites). Investigate decoded-sound memory, the iOS total canvas memory limit, and stale cached assets. Reproduce with Playwright WebKit at 428×926 DPR 3 where possible. Make the root cause go away and make the v3 sounds memory-safe (lazy decode, capped LRU, shared in-flight decodes, never hold both versions). Add unit tests. Keep the audio catalogue and the old/new switch. Lint, full unit tests, and the Netlify build before every push. Push the branch without force, then fast-forward origin/dev when it is an ancestor, rebasing and retesting first if dev moved. Never force-push.
