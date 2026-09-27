# 095 — Offline mode

## Requirements

The game is a Vite app on Netlify and already ships `site.webmanifest`. Offline play uses one Workbox service worker (`injectManifest` via `vite-plugin-pwa`), integrated with that manifest. The worker replaces the previous hand-written `public/sw.js`. Dev builds unregister the worker so local iteration does not stay cached.

Effective offline is true when any of these hold:

- `navigator.onLine` is false
- the player forced offline
- a same-origin connectivity probe of `/offline-probe.txt` failed (`navigator.onLine` can report online while the network is dead)

Forced offline is a checkbox-style toggle stored in `localStorage` under `cfb-forced-offline`. Clicking the status control flips that flag. The sidebar chip shows the same effective state.

## Controls

The toggle is a pill at the top left of the playfield, in the same cluster as the gamepad player chips and styled like `.gamepad-remote`. On a phone with the sidebar collapsed or condensed, that cluster stays at the top left of the screen instead of keeping the desktop sidebar offset. It is a `<button type="button">` with `aria-pressed` set to the effective offline state. Online uses the green lamp. Offline uses an amber lamp and the label Offline. `display: inline-flex` does not override `[hidden]`: hidden offline chrome uses `display: none !important`.

On hover, focus, or a touch press, the pill shows the cache status:

- `Preparing offline cache… {percent}%` until the worker finishes precaching
- `Offline ready, {size} cached` after that, for example `Offline ready, 42.3 MB cached`

The size is the sum of Cache Storage responses, using `Content-Length` when present and the blob size otherwise. If that sum cannot be read, the UI uses `navigator.storage.estimate().usage`.

The sidebar shows an Offline chip, hidden while the game is online, with the same `[hidden]` rule.

While offline, the Multiplayer accordion is covered by a shield. Controls inside it are disabled and the section cannot open. Hover, focus, and a touch press show the hint. While that hint is showing, the accordion stacks above the following sidebar sections so the hint is not covered. The English hint is exactly `Multiplayer is not available in offline mode!`. The shield also sets that string as its `title`. German uses `Mehrspieler ist im Offlinemodus nicht verfügbar!`.

## Precache

`vite-plugin-pwa` injects `self.__WB_MANIFEST` with content revisions. A later deploy downloads only files whose bytes changed. `maximumFileSizeToCacheInBytes` is 12 MiB so the music track and large sprite sheets are included.

Included: the app shell, JS, CSS, SVG icons, PNG and WebP sprites and tile sheets, MP3 and OGG sounds (including narrator MP3s under `/video`), JSON manifests, the web manifest, and the built-in demo save (it is part of the JS bundle). Google fonts are runtime-cached on the first controlled visit (`fonts.googleapis.com` stale-while-revalidate, `fonts.gstatic.com` cache-first). The font stack still falls back to Arial Narrow.

Excluded from the precache and served network-only:

- `*.mp4`, `*.webm`, `*.mov`, `*.m4v` (milestone and mission clips, including `public/video/old`)
- `/offline-probe.txt`
- `/api/*` and `/.netlify/functions/*` (signalling)
- the Netlify Drawer (`app.netlify.com`, `netlify-cdp-loader`, drawer and collaborator script URLs)

Document navigations are fetched from the network and are not written to Cache Storage, so a deploy preview's injected drawer toolbar is not cached. If that fetch fails, the worker returns the precached `/index.html`. Each deploy preview is its own origin, so the worker scope stays on that preview.

Milestone and mission videos are not started while offline. The narrator MP3 still plays when it is cached, and the milestone title is shown as a notification. Mission intros stay on the briefing and may play companion audio. LLM ticks and completion requests return without calling the network. Invite join does the same and shows the multiplayer hint.

## Updates

The worker does not call `skipWaiting` during install. When a new worker is waiting and a battle is already running, the page shows a non-blocking `Update available – reload` control and does not reload. Accepting it posts `SKIP_WAITING` and reloads. A waiting worker found at the start of a visit, before a battle is in progress, is applied then (next start). The page checks for a new worker when the tab becomes visible, which downloads a new version only when `sw.js` actually changed. `sw.js`, `registerSW.js`, `/`, `/index.html`, and `/offline-probe.txt` are `Cache-Control: no-cache`. Files under `/assets/*` stay `public, max-age=31536000, immutable`.

## Performance

This feature does not add work to the simulation tick, the render loop, or per-entity drawing. Cache size is measured on hover and when precache completes. The connectivity probe runs on online/offline events and every 30 seconds. The 75 FPS gate is unchanged because there is no hot-path edit. The performance widget is untouched.

## Verification

Unit coverage lives in `tests/unit/offlineMode.test.js`.

A production build precaches 486 files, 27407.74 KiB. The pill reports that as `Offline ready, 26.8 MB cached` before runtime font responses are added. After the first controlled visit the same sum was `Offline ready, 27.2 MB cached` (498 Cache Storage entries, including the Google font cache). No `.mp4`, `.webm`, `.mov`, or `.m4v` response was stored.

Production check, from a built `dist` served by `vite preview`:

1. Load once online and wait until the pill reports the cache ready.
2. `context.setOffline(true)`, reload, and confirm the match runs (`gameState.gameStarted` and advancing `gameTime`), the offline pill and sidebar chip are visible, and Multiplayer shows the hint.
3. Go online and toggle forced offline from the pill.
4. Build a second worker (append a comment to `dist/sw.js`), call `registration.update()`, and confirm the reload prompt appears without an automatic reload. Accepting it reloads onto the new worker.

Screenshots: desktop and phone portrait of the pill in both states, the cache-size tooltip, the sidebar chip, and the disabled Multiplayer hint.
