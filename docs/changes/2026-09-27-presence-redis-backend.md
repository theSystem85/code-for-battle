# 2026-09-27 — Presence backend field

Notes for this follow-up live here so they are not appended to `TODO/Bugs.md`, `TODO/Features.md`, or `TODO/Improvements.md`. Spec: [Multiplayer stats and quick match](../../specs/097-multiplayer-stats.md).

## Feature

- [x] **Presence response names its store** — `POST /api/presence` includes `backend`: `redis` when Upstash handled the heartbeat, `blobs` on the Netlify Blobs fallback, and `memory` on the local signalling helper. `storage` repeats that value. Deploy previews with `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (Functions and Runtime, all contexts) should report `redis`.
  - Spec: [Multiplayer stats and quick match](../../specs/097-multiplayer-stats.md)
