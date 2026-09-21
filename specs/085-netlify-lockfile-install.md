# Spec 085: Netlify Lockfile Install

## Goal
Keep Netlify Deploy Preview / production builds on the same deterministic dependency tree as GitHub CI so the site build and smoke test can run.

## Requirements
- `netlify.toml` build command must install from the committed `package-lock.json`.
- The install must include devDependencies (`vite`, `vitest`, `jsdom`) even when Netlify sets `NODE_ENV=production` during the build command.
- The command must still run `npm run build` and `npm run test:smoke`.
- The command must not delete `package-lock.json` or `node_modules` before a floating `npm install`.

## Reproduction
Deleting the lockfile and resolving `package.json` ranges with current npm 10.9.x crashes arborist:

```
npm error Cannot read properties of null (reading 'edgesOut')
```

The unfinished timer is `idealTree:node_modules/vitest` while optional peers pull both vitest 4.x and vitest 5.x (`vitest@*`). `npm ci` against the committed lockfile succeeds. This failed Deploy Previews that still used the old command, including PR 685 (`cursor/loading-screen-f29f`) and PR 683 (`wang-tiles-smooth-transitions`) during `building site` with exit code 2. The same install command is already on `main`.

## Acceptance Criteria
- `npm ci --include=dev && npm run build && npm run test:smoke` succeeds locally and is what Netlify runs.
- Loading-screen feature code is unchanged by this install fix.
- Wang-tile / rendering behavior is unchanged.
