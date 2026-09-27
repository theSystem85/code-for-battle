# 2026-09-27 — Presence backend field

Notes for this follow-up live here so they are not appended to `TODO/Bugs.md`, `TODO/Features.md`, or `TODO/Improvements.md`. Spec: [Multiplayer stats and quick match](../../specs/097-multiplayer-stats.md).

## Feature

- [x] **Presence response names its store** — `POST /api/presence` includes `backend`: `redis` when Upstash handled the heartbeat, `blobs` on the Netlify Blobs fallback, and `memory` on the local signalling helper. `storage` repeats that value. `redisConfigured` is true only for Redis. `handler` is `edge`, `function`, or `edge-forward`.
  - Spec: [Multiplayer stats and quick match](../../specs/097-multiplayer-stats.md)
- [x] **Edge reads secret Upstash values by literal name** — `Netlify.env.get('UPSTASH_REDIS_REST_URL')` and `Netlify.env.get('UPSTASH_REDIS_REST_TOKEN')` run in the edge function, then `toObject()`, `Deno.env`, and `process.env`. A thrown get on one key does not drop the other.
  - Spec: [Multiplayer stats and quick match](../../specs/097-multiplayer-stats.md)
- [x] **Preview check on commit `bb4730db`** — `POST https://deploy-preview-722--code-for-battle.netlify.app/api/presence` returned HTTP 200 with `backend: "blobs"`, `redisConfigured: false`, and `handler: "edge-forward"` (`x-cfb-stats-handler: edge-forward`). The edge function ran, both Upstash variables were empty there, and the Node function also stored the heartbeat in Blobs. The site env API for `code-for-battle` lists only `IMPRESSUM_CONFIG_JSON`. Team shared env vars are empty. A non-secret `UPSTASH_REDIS_REST_URL` would appear in that list; it does not, so this preview cannot reach the Frankfurt Redis database.
  - Spec: [Multiplayer stats and quick match](../../specs/097-multiplayer-stats.md)
