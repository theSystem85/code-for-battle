2026-09-21T23:38:25Z
Grok 4.7 in Cursor Cloud Agent (harness: Cursor). Token counts and exact reasoning-token totals were not available for this run. Wall clock from the prompt timestamp 2026-09-21T23:37:00Z through the implementation commit at 2026-09-21T23:40:28Z.

# Prompt

Prevent Netlify deploy regressions on theSystem85/code-for-battle by hardening `main`.

## Context
`main` already has the correct Netlify build command:
`npm ci --include=dev && npm run build && npm run test:smoke`
Feature branches that still carry an old `netlify.toml` deleting `package-lock.json` fail Deploy Previews with npm arborist `edgesOut` null errors.

## Goal
Add a durable guard so CI fails if someone reintroduces the broken pattern, so future branches from `main` stay fixed and PRs that rewrite `netlify.toml` badly get caught in GitHub Actions before/alongside Netlify.

## Implement
1. Confirm `main`'s `netlify.toml` still uses `npm ci --include=dev` and does NOT delete `package-lock.json` or use a floating `npm install` for the primary build command. Fix it if not.
2. Add a small unit or CI test (prefer an existing unit/CI pattern in the repo) that reads `netlify.toml` and asserts:
   - build command includes `npm ci`
   - build command does not match deleting package-lock (e.g. no `rm ... package-lock`)
   - build command does not use bare `npm install` as the install step without ci
3. Keep the explanatory comment in `netlify.toml`.
4. Open a PR to `main` (or push a focused PR) with the guard test. Do not change game features.

## Done when
A PR exists with the regression test; `npm run test:unit` (or the project's CI test command) passes; documentation comment in netlify.toml remains clear.
