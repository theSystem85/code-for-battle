# 2026-09-21T23:37:00Z

**LLM:** Cursor Cloud Agent using Grok 4.7
**Harness:** Cursor Cloud Agent
**Tokens / duration:** exact token counts are not available from this run. Duration will be recorded after verification finishes.

## Prompt

Fix Netlify Deploy Preview for PR https://github.com/theSystem85/code-for-battle/pull/684 on branch `cursor/organic-coast-generation-351e`.

## Problem
Deploy failed (same as before): this branch's `netlify.toml` still has:
```
rm -rf node_modules package-lock.json && npm install && npm run build && npm run test:smoke
```
That crashes npm with `Cannot read properties of null (reading 'edgesOut')`.

## Fix
Set `[build].command` to match `main`:
```
npm ci --include=dev && npm run build && npm run test:smoke
```
Keep the comment on main explaining why. Do not change map-generation feature code.

Optionally merge or cherry-pick only the netlify.toml from `main` if that is cleaner.

Push to `cursor/organic-coast-generation-351e` so PR 684 updates. Verify `npm ci --include=dev && npm run build` (or smoke) if practical.
