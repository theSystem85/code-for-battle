# 2026-09-21T21:14:00Z

**LLM:** Cursor Grok 4.7
**Harness:** Cursor Cloud Agent
**Tokens / duration:** exact token counts are not available from this run. Local verification of `npm ci --include=dev && npm run build && npm run test:smoke` completed successfully (npm 10.9.7, Node v22.14.0): lockfile install, Vite production build, and the browser console smoke test all passed. `package-lock.json` was not regenerated.

## Prompt
Fix the Netlify Deploy Preview build for this branch only.

Repo: https://github.com/theSystem85/code-for-battle
Branch: wang-tiles-smooth-transitions (PR https://github.com/theSystem85/code-for-battle/pull/683)

## Problem
Deploy preview failed with exit code 2 during building site. The branch `netlify.toml` currently has:

```
rm -rf node_modules package-lock.json && npm install && npm run build && npm run test:smoke
```

Deleting package-lock.json and running a floating `npm install` crashes npm/arborist with:
`Cannot read properties of null (reading 'edgesOut')`
(while resolving vitest optional peers). Same failure previously fixed on the jet-fuel branch.

## Required fix
Update `netlify.toml` build.command to install from the lockfile, keeping Vite/Vitest available even if NODE_ENV=production:

```
npm ci --include=dev && npm run build && npm run test:smoke
```

(or the equivalent `npm ci --include=dev` form already proven on the jet-fuel fix commit). Do NOT delete package-lock.json.

## Constraints
- Minimal change: netlify.toml (and package-lock.json only if regenerating is truly required for `npm ci` to work).
- Do not change wang tiles / rendering feature code.
- Push to `wang-tiles-smooth-transitions` so PR 683 updates.
- Verify locally: run the new build command (or at least `npm ci --include=dev` + `npm run build`).
- Report what changed and the verification result.

## Done when
netlify.toml no longer wipes the lockfile; install uses npm ci with lockfile; change is on the PR branch.

## Fix
Use `npm ci --include=dev && npm run build && npm run test:smoke` in `netlify.toml` so Vite/Vitest stay pinned and are installed even if Netlify sets `NODE_ENV=production` during the build command. Wang-tile rendering code is unchanged. `package-lock.json` is kept.
