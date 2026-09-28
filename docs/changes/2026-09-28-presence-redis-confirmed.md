# 2026-09-28 — Preview Redis confirmed

Notes for this follow-up live here so they are not appended to `TODO/Bugs.md`, `TODO/Features.md`, or `TODO/Improvements.md`. Spec: [Multiplayer stats and quick match](../../specs/097-multiplayer-stats.md).

## Feature

- [x] **Rebase onto #721** — Branch rebased onto `166a9dc4` (offline assets and the compact sidebar). No merge commit. `git push --force-with-lease` started the preview that can see the new Upstash token.
  - Spec: [Multiplayer stats and quick match](../../specs/097-multiplayer-stats.md)
- [x] **Deploy preview uses Redis** — `POST /api/presence` on https://deploy-preview-722--code-for-battle.netlify.app for commit `40c126df` returned `backend: "redis"`, `redisConfigured: true`, `handler: "edge"`. A second heartbeat raised `lookingForMatch`. `POST /api/quick-match` claimed that host token; the next claim returned `inviteToken: null`. Two parallel claims against a second host returned the token once. The host heartbeat then reported `openSlot: "filled"`.
  - Spec: [Multiplayer stats and quick match](../../specs/097-multiplayer-stats.md)
- [x] **Production omits store debug fields** — When `CONTEXT` is `production`, the response drops `backend`, `storage`, `redisConfigured`, and `handler`. Deploy previews, branch deploys, and local runs still include them. Counts and invite tokens stay.
  - Spec: [Multiplayer stats and quick match](../../specs/097-multiplayer-stats.md)
- [x] **Presence row lines up with the section** — The playing-now line, Quick match row, and TURN note use 10px horizontal padding, the same inset as player-row content and field labels, on desktop and phone portrait. Vertical margins stay as they were.
  - Spec: [Multiplayer stats and quick match](../../specs/097-multiplayer-stats.md)
