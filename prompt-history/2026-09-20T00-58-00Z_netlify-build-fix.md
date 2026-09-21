# 2026-09-20T00:58:00Z

**LLM:** Cursor Grok 4.6  
**Harness:** Cursor Cloud Agent  
**Tokens / duration:** not available from this run

## Prompt
The Netlify Deploy Preview for PR 682 failed. Reproduce the production/Netlify build locally, fix the failure so the deploy preview succeeds, push to the same PR branch, and report the root cause and fix. Keep jet fuel behaviour intact.

## Root cause
`netlify.toml` ran `rm -rf node_modules package-lock.json && npm install && npm run build && npm run test:smoke`.

A lockfile-less `npm install` of the current `package.json` ranges crashes npm 10.9.x / arborist:

```
npm error Cannot read properties of null (reading 'edgesOut')
```

The unfinished timer is `idealTree:node_modules/vitest` while optional peers resolve both vitest 4.x and `vitest@*` (5.0.1). GitHub CI uses `npm ci` and therefore passed. Netlify reported `Failed during stage 'building site': Build script returned non-zero exit code: 2`. The same install crash also explains why main and other recent previews failed after 2026-09-04.

`npm ci` against the committed lockfile succeeds.

## Fix
Use `npm ci --include=dev && npm run build && npm run test:smoke` in `netlify.toml` so Vite/Vitest stay pinned and are installed even if Netlify sets `NODE_ENV=production` during the build command. Jet fuel code is unchanged.
