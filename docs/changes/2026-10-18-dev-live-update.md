# Live updates on the dev deploy (2026-10-18)

First step of B-008 (hot code push, single-player). Patrick plays on the dev deploy and does not want to reload on his own after every merge into `dev`.

## Update manifest (`dist/build-info.json`, `scripts/liveUpdateBuildInfo.mjs`)
- `manifestVersion` (format of the file, 1), `version`, `commit`, `message`, `builtAt`, `liveUpdate`.
- `stateSchemaVersion`: `GAME_STATE_SCHEMA_VERSION` from `src/gameStateSchema.js` (1). Groundwork for live state migration: a running game whose schema differs from a new deploy treats it as breaking.
- `update`: `{ kind, reason }` from the deploying commit's trailer `Live-Update: safe` / `Live-Update: breaking (<reason>)`, otherwise `auto`. This is how the coding agent records its decision.
- `jsSignature`: SHA-256 over the rendered code of every JS module, with hashed file names replaced by `<hash>`, the version string replaced, and the release-note JSON (`features/**`), `src/version.json` and the release-digest glob entries left out. A CSS-only PR with its release-note entry keeps the signature; any real JS change alters it.
- `css`: stable key -> hashed stylesheet path (`html:<n>` for the `<link>` tags of index.html, `chunk:<owner>:<n>` for CSS that Vite attaches to JS chunks).

## Client (`src/pwa/liveUpdate.js`, `src/pwa/liveUpdate.css`)
- Loaded from `src/startup.js` only when `__LIVE_UPDATE__` is true (dev branch deploy, `CFB_LIVE_UPDATE=1`) or under `npm run dev`. Production builds contain no live-update chunk.
- Polls `/build-info.json?t=…` (`cache: 'no-store'`) every 20 s and on `visibilitychange`.
- Every update is announced: a bubble at the top and a line under the version in the left sidebar, saying whether it needs a reload.
- Safe (same signature, same schema, trailer not `breaking`): changed stylesheet `<link>`s are replaced in place (the old one is removed after the new one loaded), version labels updated, no reload.
- Breaking: "Reload now" / "Later" in the bubble and "Load" in the sidebar. Nothing happens without consent. On consent: `prepareForLiveUpdateReload()` saves `lastGame`, sets the auto-resume flag and flushes IndexedDB; then the waiting service worker is activated, the startup reload guard is set, and the page reloads. Boot restores the game via `maybeResumeLastPausedGame`, and the bubble says "Updated to v… Your game was restored."
- A deploy already newer than the running build at the first poll is offered as a breaking update. A failed reload for the same commit is never repeated.
- Single-player scope means no other human connected over the network. Local games against AI ("You (Host)") are in scope. While another human is connected (`isRemote`, WebRTC session `connected`, or a remote human in another party), updates are announced but held until the first poll after the match.
- The service worker bypasses `/build-info.json`, and the offline asset plan excludes it.

## Not done (B-008 follow-ups)
- Hot-swapping changed JS modules in the running game at a safe point between ticks, with per-module state handover.
- Live state migration functions between `stateSchemaVersion`s.
- Multiplayer hot code push (out of scope).

## Verification
- Local (`CFB_LIVE_UPDATE=1` build + `vite preview`, same page instance): a CSS-only rebuild was applied live with game money unchanged (`local-1-before-css.png`, `local-2-after-css.png`); a JS rebuild showed the breaking notice and did not reload for 25 s (`local-3-breaking-notice.png`); after "Reload now" the page reloaded and restored the game (money 31337 kept, `local-4-after-consent-reload.png`). All under `/workspace/vfx-verify/live-update/`.
- Dev deploy: a CSS-only follow-up PR, checked on a page that stayed open from before that deploy (`dev-*.png`).

## Tests
U05211–U05220 (`tests/unit/liveUpdate.test.js`, `tests/unit/liveUpdateBuildInfo.test.js`).
