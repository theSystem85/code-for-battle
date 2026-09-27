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

The size is the sum of Cache Storage responses, using `Content-Length` when present and the blob size otherwise. An empty Cache Storage reports `0`. If Cache Storage cannot be read, the UI uses `navigator.storage.estimate().usage`.

## Clear cache

Settings → Runtime Config has an Offline section with the cached size and **Clear offline cache**. A mouse long-press or right-click on the sidebar toggle opens the same action. A touch long-press shows the cache tooltip instead, because that gesture is the touch equivalent of hover. The control asks with the in-game confirm dialog before it does anything. Confirming deletes only this app's `workbox-*`, `cfb-*`, and `code-for-battle-cache-*` Cache Storage entries and unregisters the service worker. Saved games, settings, `localStorage`, and IndexedDB are left in place.

After clearing, the section and the dialog show the new size as not cached (`0.0 MB`) and say the game downloads the cache again the next time it loads while online. The dialog offers reload. When the game is already offline, the confirm and the result both warn that clearing makes the game unavailable offline until the next visit with a connection.

English and German strings live under `offline.clear`.

Portrait phone toasts are full-width and fixed. Their top is `calc(var(--safe-area-top) * 2 + 72px)`, which sits below the sidebar toggle. The portrait sidebar already starts at the safe area and then pads by the safe area again, so a single inset would cover the button on a notched phone.

While offline, the Multiplayer accordion is covered by a shield. Controls inside it are disabled and the section cannot open. Hover, focus, a touch tap, and a touch long-press show the hint in one custom tooltip (`#multiplayerOfflineTip`), also `position: fixed` on the body so the sidebar cannot clip it. The English hint is exactly `Multiplayer is not available in offline mode!`. The shield, the toggle, and the disabled multiplayer controls do not use a `title` attribute for that hint. Disabled controls point at the tip with `aria-describedby`. Their previous `title` values are restored when the game is online again. German uses `Mehrspieler ist im Offlinemodus nicht verfügbar!`.

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

This feature does not add work to the simulation tick, the render loop, or per-entity drawing. Cache size is measured on hover, focus, touch, and when precache completes. The connectivity probe runs on online/offline events and every 30 seconds. The performance widget is untouched. The 75 FPS gate is not certified in this headless session.

## Verification

Unit coverage lives in `tests/unit/offlineMode.test.js`.

A production build precaches 486 files, 27418.45 KiB. The sidebar toggle reports that as about `26.8 MB` before runtime font responses are added. After the first controlled visit the tooltip read `Offline ready, 27.2 MB cached`. No `.mp4`, `.webm`, `.mov`, or `.m4v` response was stored.

Production check, from a built `dist` served by `vite preview`:

1. Load once online and wait until the sidebar toggle's tooltip reports the cache ready.
2. `context.setOffline(true)`, reload, and confirm the match runs (`gameState.gameStarted` and advancing `gameTime`), the same sidebar toggle shows Offline, and Multiplayer shows the custom hint.
3. Go online and toggle forced offline from that sidebar button.
4. Build a second worker (append a comment to `dist/sw.js`), call `registration.update()`, and confirm the reload prompt appears without an automatic reload. Accepting it reloads onto the new worker.

Screenshots: desktop and phone portrait of the sidebar top with the button online, offline, and the hover tooltip. The tooltip shot shows only the custom tip. Portrait toasts start below the button.
