# Bug fixes

- [x] **Prepared soil sprites blocked the dev deploy**
  The naval routing commit regenerated `dtv7_nature_soil_large.webp` and left the prepared map-sprite tiers stale. Netlify's `npm run build` runs `check:map-sprite-tiers` first, so both later `dev` branch deploys failed before Vite. Regenerated only the stale soil tiers and catalog.
  Spec: none

## Verification

Reproduced with Node 22 and `CONTEXT=branch-deploy BRANCH=dev CI=true`, the same command as `netlify.toml`: `npm ci --include=dev && npm run build && npm run test:smoke`. Before the refresh, `check:map-sprite-tiers` exited 1 with stale `catalog.json`, `dtv7_nature_soil_large.json`, `dtv7_nature_soil_large.coarse.webp`, and `dtv7_nature_soil_large.final.webp`. Netlify reports that failure as "Build script returned non-zero exit code: 2". After `npm run build:map-sprite-tiers`, the same command exited 0, `dist/build-info.json` has `liveUpdate: true`, and smoke test U00001 passed.

No simulation or render code changed. Hardware 75 FPS acceptance is unchanged and was not remeasured; no verified hardware GPU is available here.
