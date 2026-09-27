# 095 — Offline mode

## Requirements

The game is a Vite app on Netlify and already ships `site.webmanifest`. Offline play uses one Workbox service worker (`injectManifest` via `vite-plugin-pwa`), integrated with that manifest. The worker replaces the previous hand-written `public/sw.js`. Dev builds unregister the worker so local iteration does not stay cached.

Effective offline is true when any of these hold:

- `navigator.onLine` is false
- the player forced offline
- a same-origin connectivity probe of `/offline-probe.txt` failed (`navigator.onLine` can report online while the network is dead)

Forced offline is a checkbox-style toggle stored in `localStorage` under `cfb-forced-offline`. Clicking the status control flips that flag.

## Controls

There is one online/offline control. It is a button at the top of the sidebar, above the minimap, in both the online and offline states. It is not repeated over the map and it is not a second sidebar chip. It is a `<button type="button">` styled like `.gamepad-remote`, with `aria-pressed` set to the effective offline state and `aria-label` set to the toggle name. Online uses the green lamp and the label Online. Offline uses an amber lamp and the label Offline. The button stays in the document; other offline chrome that uses `[hidden]` is `display: none !important` so `inline-flex` cannot paint a hidden control.

Hover and keyboard focus show the cache status in one custom tooltip (`#offlineModeTip`). The button has no `title` attribute, so the browser tooltip does not appear beside it. The tip is a body-level `position: fixed` element placed from the button's box, so sidebar `overflow: hidden` and the scrolling sidebar pane do not clip it. A touch tap or long-press shows the same tip. A mouse long-press or right-click still opens clear-cache. While the tip is already visible, a cache-size refresh only moves that same element. The text is:

- `Preparing offline cache… {percent}%` until the worker finishes precaching
- `Offline ready, {size} cached` after that, for example `Offline ready, 42.3 MB cached`

The size and file count come from the Cache API measured against the expected boot and offline-asset lists (`27.1 MB · 486/486 files`). While the bulk download is still running the same shape shows progress (`8.2 MB · 119/486 files`). `navigator.storage.estimate()` is used only when Cache Storage cannot be read. An empty Cache Storage reports `0`.

Forcing offline before that list is complete warns, in the tooltip and in Settings, that the game may not load until the download finishes. The toggle still changes. A download or install failure shows the failing URL and error in the tooltip and in Settings. **Retry download** stays visible in that section: disabled while the cache is complete, enabled when a download or install has failed. Retry calls `registration.update()` and starts the asset loop again.

## Clear cache

Settings → Runtime Config has an Offline section with the cached size and **Clear offline cache**. A mouse long-press or right-click on the sidebar toggle opens the same action. A touch long-press shows the cache tooltip instead, because that gesture is the touch equivalent of hover. The control asks with the in-game confirm dialog before it does anything. Confirming deletes only this app's `workbox-*`, `cfb-*`, and `code-for-battle-cache-*` Cache Storage entries and unregisters the service worker. Saved games, settings, `localStorage`, and IndexedDB are left in place.

After clearing, the section and the dialog show the new size as not cached (`0.0 MB`) and say the game downloads the cache again the next time it loads while online. The dialog offers reload. When the game is already offline, the confirm and the result both warn that clearing makes the game unavailable offline until the next visit with a connection.

English and German strings live under `offline.clear`.

Portrait phone toasts are full-width and fixed. Their top is `calc(var(--safe-area-top) * 2 + 72px)`, which sits below the sidebar toggle. The portrait sidebar already starts at the safe area and then pads by the safe area again, so a single inset would cover the button on a notched phone.

While offline, the Multiplayer accordion is covered by a shield. Controls inside it are disabled and the section cannot open. Hover, focus, a touch tap, and a touch long-press show the hint in one custom tooltip (`#multiplayerOfflineTip`), also `position: fixed` on the body so the sidebar cannot clip it. The English hint is exactly `Multiplayer is not available in offline mode!`. The shield, the toggle, and the disabled multiplayer controls do not use a `title` attribute for that hint. Disabled controls point at the tip with `aria-describedby`. Their previous `title` values are restored when the game is online again. German uses `Mehrspieler ist im Offlinemodus nicht verfügbar!`.

## Boot shell and offline assets

`vite-plugin-pwa` injects `self.__WB_MANIFEST` with content revisions. That precache is only the boot shell, so install finishes and the worker can activate even when a phone suspends or a single large request fails. Workbox install is all-or-nothing; a 486-file sequential precache never activated on iPhone, so nothing controlled the page and an offline relaunch could not start.

Boot shell (Workbox precache): `index.html` and the other HTML pages, JS, CSS, the web manifest, SVG and ICO icons, root favicon and touch icons, `icons/`, `cursors/`, and `images/sidebar/` (the first screen). `maximumFileSizeToCacheInBytes` stays 12 MiB for the JS bundle. The built-in demo save is part of the JS bundle.

Bulk offline assets are not in the precache. The build writes `/offline-assets-manifest.json` with MD5 revisions and file sizes. It lists large images and atlases, every MP3, OGG, and WAV (including narrator MP3s under `/video`), and JSON that is not needed to boot. The manifest itself is precached and is not part of the file count. After the worker activates and controls the page, the page fills `cfb-offline-assets-v1` from that list:

- concurrency 5
- already-cached entries whose `x-cfb-asset-revision` matches are skipped
- retries with exponential backoff; a 404 is not retried
- pauses while `navigator.onLine` is false, the connectivity probe has failed, or the page is hidden
- resumes on the next launch, when the tab becomes visible, and when the network returns
- deletes entries that are no longer in the manifest or whose revision changed

Fill requests use the `x-cfb-offline-fill` header and are left unmatched by the worker, so the browser performs the page's own network fetch and the page stores the full 200. Runtime requests for those URLs are CacheFirst from `cfb-offline-assets-v1`, falling back to the network. Audio uses CacheFirst with `CacheableResponsePlugin({ statuses: [200] })` and `RangeRequestsPlugin`, so Safari `<audio>` Range requests are sliced from the cached full file and a 206 is never stored. Same-origin `Audio` elements keep the default cross-origin mode (no CORS). A cross-origin URL sets `crossOrigin = anonymous`.

Google fonts are runtime-cached on the first controlled visit (`fonts.googleapis.com` stale-while-revalidate, `fonts.gstatic.com` cache-first). The font stack still falls back to Arial Narrow.

Excluded from both caches and served network-only:

- `*.mp4`, `*.webm`, `*.mov`, `*.m4v` (milestone and mission clips, including `public/video/old`)
- `/offline-probe.txt`
- `/api/*` and `/.netlify/*` (signalling)
- the Netlify Drawer (`app.netlify.com`, `netlify-cdp-loader`, drawer and collaborator script URLs)

Document navigations try the network for 3 seconds and are not written to Cache Storage, so a deploy preview's injected drawer toolbar is not cached and an offline relaunch does not wait on a hung radio. If that fetch fails or times out, the worker returns the precached `/index.html` via `createHandlerBoundToURL`. Navigations to `/api/` and `/.netlify/` never receive the shell. Each deploy preview is its own origin, so the worker scope stays on that preview.

## Readiness and persistent storage

Offline ready means a service worker is controlling the page and every expected boot and bulk entry is present in Cache Storage. The sidebar tooltip and Settings → Offline show that measured size and `done/total` file count. Settings also shows the persistent-storage result.

The page calls `navigator.storage.persist()` in production and whenever the app is running standalone (Home Screen). `navigator.storage.persisted()` is checked first. Each call gives up after 4 seconds so a hung browser promise still fills the Settings line: `Storage: persistent`, `Storage: not persistent`, or `Storage: persistence unavailable` when the API is missing.

Clearing the cache still deletes only this app's `workbox-*`, `cfb-*` (including `cfb-offline-assets-v1`), and `code-for-battle-cache-*` Cache Storage entries and unregisters the service worker. Saved games, settings, `localStorage`, and IndexedDB stay. The in-progress download stops and does not start again until the next online load.

Milestone and mission videos are not started while offline. The narrator MP3 still plays when it is cached, and the milestone title is shown as a notification. Mission intros stay on the briefing and may play companion audio. LLM ticks and completion requests return without calling the network. Invite join does the same and shows the multiplayer hint.

## Updates

The worker does not call `skipWaiting` during install. When a new worker is waiting and a battle is already running, the page shows a non-blocking `Update available – reload` control and does not reload. Accepting it posts `SKIP_WAITING` and reloads. A waiting worker found at the start of a visit, before a battle is in progress, is applied then (next start). The page checks for a new worker when the tab becomes visible, which downloads a new version only when `sw.js` actually changed. `sw.js`, `registerSW.js`, `/`, `/index.html`, and `/offline-probe.txt` are `Cache-Control: no-cache`. Files under `/assets/*` stay `public, max-age=31536000, immutable`.

## Performance

This feature does not add work to the simulation tick, the render loop, or per-entity drawing. The asset download and the Cache API measurement run on a 2 second timer while a download is active, and again on hover, focus, and touch. They are not per-frame. The connectivity probe runs on online/offline events and every 30 seconds. The performance widget is untouched. The 75 FPS gate is not certified in this headless session.

## Verification

Unit coverage lives in `tests/unit/offlineMode.test.js`.

The boot shell is what Workbox precaches. The offline-asset manifest adds the rest. Together they are the previous full game cache (about 27 MB, hundreds of files) without putting that download inside the install event. No `.mp4`, `.webm`, `.mov`, or `.m4v` response is stored.

Production check, from a built `dist` served by `vite preview`, in Chromium and WebKit:

1. Load once online and wait until Settings → Offline and the sidebar button report the real size and `done/total` with `data-offline-ready="true"`.
2. `context.setOffline(true)`, reload, and confirm the shell boots (`#gameCanvas`, `gameState`), a bulk asset and an audio Range request are served from the cache, the sidebar toggle shows Offline, and Multiplayer shows the custom hint. Playwright's bundled WebKit crashes on `setOffline` plus navigation. The phone check instead aborts service-worker network fetches with `context.route` (and the connectivity probe), reloads, and confirms the worker serves the document, terrain, and audio Range response while the loading screen reaches 100%. A real iPhone airplane-mode relaunch is still required.
3. Interrupt the fill (abort bulk requests or drop offline after some files land), reload, restore the network, and confirm the loop skips what is already cached and reaches the full count.
4. Go online and toggle forced offline before the count is complete. The tooltip and Settings warn that the download is incomplete.
5. Build a second worker (append a comment to `dist/sw.js`), call `registration.update()`, and confirm the reload prompt appears without an automatic reload while a battle is running. Accepting it reloads onto the new worker.

### iPhone

Open the Home Screen app while online and leave it in the foreground until Settings → Offline shows the full size and file count and `Storage: persistent` (or the browser's actual persist result). Force-quit, turn on airplane mode, and relaunch. The boot shell must appear without waiting on the network. If the download was interrupted, open the app online again and leave it in front until the count finishes, then repeat the airplane-mode launch.

Screenshots: desktop and phone portrait of the sidebar top with the button online, offline, and the hover tooltip. The tooltip shot shows only the custom tip. Portrait toasts start below the button. The Settings Offline section shows the measured size and file count.
