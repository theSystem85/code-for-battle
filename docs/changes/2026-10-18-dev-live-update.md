# Live updates on the dev deploy (2026-10-18)

Patrick plays on the dev deploy and does not want to reload after every merge into `dev`.

## How it works
- `scripts/liveUpdateBuildInfo.mjs` (Vite plugin, every build) writes `dist/build-info.json` with `version`, `commit`, `message`, `builtAt`, `liveUpdate`, `jsSignature` and `css` (stable key -> hashed stylesheet path; `html:<n>` for the `<link>` tags of index.html, `chunk:<owner>:<n>` for CSS that Vite attaches to JS chunks).
- `jsSignature` is a SHA-256 over the rendered code of every JS module, with hashed file names replaced by `<hash>`, the version string replaced, and the release-note JSON (`features/**`), `src/version.json` and the release-digest glob entries left out. A CSS-only PR with its release-note entry keeps the signature; any real JS change alters it.
- `src/pwa/liveUpdate.js` (loaded from `src/startup.js` only when `__LIVE_UPDATE__` is true or under `npm run dev`) polls `/build-info.json?t=…` with `cache: 'no-store'` every 20 s and on `visibilitychange`.
  - Same signature: each changed stylesheet `<link>` is replaced by a new one next to it, and the old one is removed after the new sheet loaded. `#appVersion`, `#appCommitMessage` and the loading-screen version are updated. No reload.
  - New signature: a toast, `prepareForLiveUpdateReload()` (saves `lastGame`, sets the auto-resume flag, flushes IndexedDB), activation of the waiting service worker (`SKIP_WAITING`, wait for `controllerchange`), the startup reload guard is set so boot does not reload a second time, then `location.reload()`. Boot restores the game via `maybeResumeLastPausedGame`, and a toast says "Updated to v… Your game was restored."
  - When the first poll already sees a newer commit than the running build, it takes the reload path (the running stylesheet map is unknown).
  - A failed attempt for the same commit never reloads again (sessionStorage guard). Multiplayer matches are never reloaded; the player gets a notice.
- `__LIVE_UPDATE__` is true only for `CONTEXT=branch-deploy` + `BRANCH=dev` on Netlify or `CFB_LIVE_UPDATE=1`. Production builds contain no live-update chunk.
- The service worker bypasses `/build-info.json`, and the offline asset plan excludes it.

## Verification
- Local: `CFB_LIVE_UPDATE=1` build + `vite preview`. A CSS-only rebuild was applied on the running page (same page instance, game money unchanged); a JS rebuild reloaded and restored the game (money 31337 kept). Screenshots in `/workspace/vfx-verify/live-update/local-*.png`.
- Dev deploy: a CSS-only follow-up PR, checked on a page that stayed open from before the deploy (`/workspace/vfx-verify/live-update/dev-*.png`).

## Tests
U05211–U05219 (`tests/unit/liveUpdate.test.js`, `tests/unit/liveUpdateBuildInfo.test.js`).
