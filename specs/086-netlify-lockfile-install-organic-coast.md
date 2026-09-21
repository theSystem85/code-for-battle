# Spec 086: Netlify Lockfile Install (organic coast branch)

## Goal
Keep the organic-coast branch Deploy Preview on the same deterministic dependency tree as `main` and GitHub CI so the site build and smoke test can run.

## Requirements
- `netlify.toml` `[build].command` matches `main`: `npm ci --include=dev && npm run build && npm run test:smoke`.
- The install includes devDependencies (`vite`, `vitest`, `jsdom`) even when Netlify sets `NODE_ENV=production` during the build command.
- The command must not delete `package-lock.json` or `node_modules` before a floating `npm install`.
- Map-generation feature code stays unchanged.

## Reproduction
Deleting the lockfile and resolving `package.json` ranges with current npm 10.9.x crashes arborist:

```
npm error Cannot read properties of null (reading 'edgesOut')
```

The unfinished timer is `idealTree:node_modules/vitest` while optional peers pull both vitest 4.x and vitest 5.x (`vitest@*`). `npm ci` against the committed lockfile succeeds. This failed the Deploy Preview for PR 684 (`cursor/organic-coast-generation-351e`) during `building site` with the same crash previously fixed on `main`.

## Acceptance Criteria
- `netlify.toml` keeps the committed lockfile and uses `npm ci --include=dev`.
- `npm ci --include=dev && npm run build` succeeds locally when a full install is practical.
- Organic coast / center-lake generation code is unchanged.
