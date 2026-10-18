# 2026-10-18T09:25:02Z — Dev branch workflow, build-time versioning and test IDs

Processed by: Grok Bot (executor subagent; the exact model version and token counts are not exposed to the agent, so they are left out). No Codex task was used; the test ID retrofit ran as a deterministic script.

## Prompts (Patrick, translated/condensed to English)

1. Versioning: stop putting version numbers in code. Keep the last version in package.json, add only what was added since then, compute the version from the bugfix/improvement/feature entries, and from time to time fold all entry files into one file per category with a semver bump in package.json and a git tag, through a script that a "make a release" skill can trigger.
2. CI/CD for the `dev` branch: Netlify builds only `dev` as a branch deploy; no extra CI tests on `dev`, the developing AI runs tests locally before pushing (state it in AGENTS.md); all agents still open PRs into `dev` and they are merged automatically once conflicts are resolved; no deploy previews for PRs into `dev`, only `dev` deploys on merge; dev -> main is a release with version bump and tag, keeping all commits (document in an AGENTS.md Deployment section); keep the PR-number-based version label; completely separate backend data (decided later: same Upstash database with a `dev:` key prefix); Patrick switches modes in chat and Codex must also target `dev` in dev mode; turn on branch protection for `main`.
3. Every PR description contains a manual test plan table with an ID per step and a clickable checkbox, covering all features, bugfixes and improvements; the last two columns show how many unit and e2e tests cover each row. Every unit test gets an ID like U00001 and every e2e test E00001; retrofit all existing tests. IDs go into the test names.
4. Release flow approved: PR dev -> main with rebase merge, tag on main, then force-push dev to main right after a release, only if nothing new landed on dev.

## Result

- `scripts/versioning.mjs`, Vite/Vitest `define`, `features/unreleased/<category>/`, `npm run release` / `release:tag` / `version:show`, release digest reads unreleased entries.
- `scripts/netlify-ignore.mjs` as netlify.toml `ignore`; `REDIS_KEY_PREFIX` support in the API function, the multiplayer stats edge function and the Redis Lua scripts.
- `scripts/test-ids.mjs` (check in `npm run lint`, assign, list); 5,304 existing test declarations retrofitted.
- AGENTS.md Deployment, Versioning, Test IDs and PR description sections; PR template; `skills/make-a-release/SKILL.md`.

## Follow-up 2026-10-18T13:20:00Z (Patrick's answers)

Processed by: Grok Bot (executor subagent). The exact underlying model name, version and token counts are not exposed to the agent, so they are left out rather than guessed.

1. Deploy previews show only the PR label, for example `PR758`, with no version number; production and dev keep the normal version display.
2. Previews of PRs into main get no Redis key prefix and share production keys.
3. Main branch protection does not include admins; Patrick sets it up himself. The Netlify dev branch deploy is already configured by Patrick.

Result: `computeVersionLabel` returns `PR<REVIEW_ID>` on deploy previews, `formatVersionDisplay` adds the `v` only to real versions, tests, AGENTS.md, spec and change note updated.
