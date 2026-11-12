# 2026-11-12T00:01:00Z

Harness: Cursor Cloud Agent. Model: Grok 4.7. Token counts and reasoning-token totals are not exposed, so they are omitted. Elapsed time from the request through validation was about 8 minutes.

## User request

The last two Netlify branch-deploy builds of `dev` failed during "building site" with "Build script returned non-zero exit code: 2". Failing commits: `ed68acc939b309fe096bab36a74cf65433774bea` (fix(naval): simplify routes and reserve coastline clearance) and tip `3c28c589` (fix(service): stop utility vehicles before target collisions). The last successful dev build was `3a01317e`. Reproduce the failure locally with `CONTEXT=branch-deploy` and `BRANCH=dev` on the Node version from `netlify.toml`, fix it without reverting those gameplay changes, verify the Netlify build command exits 0, run the relevant unit tests and lint, and push the fix directly to `dev`.

## Result

`netlify.toml` builds with `npm ci --include=dev && npm run build && npm run test:smoke` on Node 22. `npm run build` starts with `check:map-sprite-tiers`. That check failed because the naval commit regenerated `public/images/map/sprite_sheets/dtv7_nature_soil_large.webp` and did not regenerate `public/images/prepared-map-sprites/`. Stale files: `catalog.json`, `dtv7_nature_soil_large.json`, `dtv7_nature_soil_large.coarse.webp`, and `dtv7_nature_soil_large.final.webp`. Both deploys died in about 40 seconds, before Vite. Regenerating the prepared tiers with `npm run build:map-sprite-tiers` makes the same Netlify command exit 0 with live updates enabled (`dist/build-info.json` `liveUpdate: true`, smoke test U00001 passed). `npm run lint` passed (5768 unique test IDs). `npm run test:unit` passed: 370 files, 5772 tests, including `tests/unit/mapSourceSheets.test.js` (21 tests). Naval routing and service-vehicle stopping are unchanged. No hardware GPU was available, so the 75 FPS check was not run.
