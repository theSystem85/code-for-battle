# Dev branch workflow, versioning and test IDs

Decided by Patrick on 2026-10-18 (brainstorm item B-007). AGENTS.md ("Deployment", "Versioning and release notes", "Test IDs", "Pull request descriptions") is the operational source of truth; this spec records requirements and design.

## Dev branch workflow

- Two modes, switched by Patrick in chat: main mode (PRs into `main`, merged only when Patrick asks) and dev mode (PRs into `dev`, rebase-merged automatically once they have no conflicts with `dev`). Codex is prompted only through Grok Bot and must target `dev` in dev mode.
- Netlify builds production (`main`), the `dev` branch deploy, and deploy previews for PRs into `main`. Other branch deploys and previews for PRs into `dev` are skipped by `scripts/netlify-ignore.mjs` (netlify.toml `ignore`). The PR base is read from the public GitHub API; failures build.
- No CI on `dev`. Agents run lint, unit/integration and e2e tests locally before every push.
- Backend: the dev deploy shares production's Upstash Redis database and Netlify Blobs stores; Netlify sets `REDIS_KEY_PREFIX=dev:` for the branch-deploy context only. `src/network/storageKeyPrefix.js` validates the prefix (`^[A-Za-z0-9_-]{1,32}:$`, a malformed value makes the stats endpoints answer 503 rather than touching production keys) and wraps Blobs stores; the Redis Lua scripts receive the prefix as their last ARGV.
- `main` is protected (PRs only, `smoke-test` check, no force-push or deletion, admins included).
- Release: release commit via `npm run release`, PR `dev` -> `main` with rebase merge (all commits kept), tag `vX.Y.Z` on `main` (`npm run release:tag` re-points it after the rebase rewrote the ids), then force-push `dev` to `main` only if nothing new landed on `dev`.

## Versioning

- `package.json` = last released version. Each change adds `features/unreleased/<features|improvements|bugfixes>/<name>.json` with `{ "description": "...", "breaking"?: true }`.
- Build-time version (`scripts/versioning.mjs`, Vite `define` `__APP_VERSION__`): breaking -> major, feature -> minor, improvement/bugfix -> patch, at most one bump per build.
- Display label `__APP_VERSION_LABEL__`: `X.Y.Z-pr<REVIEW_ID>` on Netlify deploy previews, plain elsewhere. Release digests and the service worker compare the plain version.
- `npm run release` folds entries into `features/<version>.json` (same format as earlier releases, so the loading screen and User Manual digest keep working), deletes entry files, bumps `package.json` and the lockfile, commits `chore(release): X.Y.Z`, tags `vX.Y.Z`; it never pushes.
- The release digest treats unreleased entries as part of the current build version.
- Replaced: `scripts/generate-version.js`, `scripts/bump-version.js` and the hand-maintained `src/version.js` constant.

## Test IDs

- `[U00001]` (unit/integration) and `[E00001]` (Playwright) at the start of each test title; IDs belong to source declarations and are never reused.
- `scripts/test-ids.mjs`: `check` (part of `npm run lint`), `assign`, `list [--markdown|--json]`.
- Retrofit on 2026-10-18: deterministic order (sorted file path, then source position).

## Verification

- Unit tests: `tests/unit/versioning.test.js`, `releaseScript.test.js`, `netlifyIgnore.test.js`, `storageKeyPrefix.test.js`, `testIds.test.js`, new cases in `releaseDigest.test.js`, `multiplayerStats.test.js`, `signallingApi.test.js`.
- Visual: loading screen version label on a deploy-preview style build.
