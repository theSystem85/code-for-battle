---
name: make-a-release
description: Use when Patrick asks to "make a release" of code-for-battle - folds the unreleased release-note entries into a new semver version, merges dev into main with a rebase merge, tags vX.Y.Z on main and resets dev.
---
# Make a release (code-for-battle)

Read the Deployment and Versioning sections of `AGENTS.md` first. Nothing is pushed before Patrick approves the changelog. Never squash. Never push to `main` directly (it is protected).

1. **Preflight**
   - `git fetch origin --tags`. Note `DEV_SHA=$(git rev-parse origin/dev)` (in main mode use `origin/main`).
   - Check open PRs into `dev`. If any are about to merge, ask Patrick whether to wait.
   - `git switch -c release/next origin/dev`, `npm ci`.
2. **Preview**: `npm run release -- --dry-run`. Show Patrick the new version and the full changelog (features, improvements, bugfixes, breaking entries). If there are no unreleased entries, stop and tell him.
3. **Wait for Patrick's OK.**
4. **Local checks**: `npm run lint`, `npm run test`, `npm run test:e2e` (or report what could not run).
5. **Create the release**: `npm run release`. It writes `features/X.Y.Z.json`, deletes the entry files, bumps `package.json` and `package-lock.json`, commits `chore(release): X.Y.Z` and creates a local tag `vX.Y.Z`. Rename the branch to `release/vX.Y.Z`. Do not push the tag yet.
6. **Release commit into dev** (dev mode): push `release/vX.Y.Z`, open a PR into `dev` with the changelog and a manual test plan table, and rebase-merge it right away (auto-merge into dev is allowed). Update `DEV_SHA` to the new `origin/dev`.
   In main mode skip this step and open the PR from `release/vX.Y.Z` into `main` in step 7.
7. **dev into main**: open a PR `dev` -> `main` titled `chore(release): X.Y.Z` with the changelog and a manual test plan covering the release. Wait for CI (`smoke-test`) and the Netlify deploy preview to go green, send Patrick the PR and preview links, then **rebase-merge** it (this merge into `main` is the release Patrick asked for; if he only asked to prepare the release, wait for his go).
8. **Tag on main**: `git fetch origin && git switch --detach origin/main`, then `npm run release:tag` (moves `vX.Y.Z` onto the rewritten release commit on `main`) and `git push origin vX.Y.Z`.
9. **Reset dev** (dev mode only, allowed only right now): if `git rev-parse origin/dev` still equals `DEV_SHA`, run `git push --force-with-lease=dev:$DEV_SHA origin origin/main:dev`. If anything new landed on `dev`, do not force-push; tell Patrick and ask how to proceed.
10. **Report**: version, tag, PR links, production deploy status, and that dev now equals main.
