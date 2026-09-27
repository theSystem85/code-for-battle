# 097 — Multiplayer stats and quick match

## Presence

`POST /api/presence` accepts `{ sessionId, status, openInviteToken? }`.

- `sessionId` is an anonymous id, 8–64 characters from `[A-Za-z0-9_-]`, created in the browser and stored in both `sessionStorage` and `localStorage` under `cfb-presence-session`.
- `status` is one of `menu`, `single-player`, `mp-host`, `mp-client`, `looking-for-match`.
- The response totals are `playing` (every fresh session), `onlineMultiplayer` (`mp-host` + `mp-client`), `lookingForMatch`, plus the per-status counts. Sessions older than 90 seconds are dropped before the counts.
- A debug field `backend` is `redis` when that response was produced by Upstash, or `blobs` when the Netlify Blobs fallback handled it. The local signalling helper reports `memory`. `storage` repeats the same value. `redisConfigured` is true only when that response used Redis. `handler` is `edge` when the edge function called Upstash, `function` when the Node function handled the request directly, and `edge-forward` when the edge function did not see both Upstash variables and forwarded once to the Node function.
- No alias, account, address, or other personal data is stored. Keys expire (Redis TTL 180 seconds on the sets, 60 seconds on the rate-limit key, 90 seconds on an open-host token).

Redis keeps one sorted set per status (`cfb:presence:<status>`, score = timestamp). A heartbeat `ZADD`s the session into its status set, `ZREM`s it from the others, `ZREMRANGEBYSCORE`s entries older than 90 seconds, then `ZCARD`s each set. Those commands run inside one `EVAL`, sent as one Upstash REST `/pipeline` request, so the rate limit can reject the heartbeat before the sets change. The per-session limit is 8 requests per 60 seconds.

The client sends a heartbeat about every 45 seconds, with ±5 seconds of jitter, and again as soon as the status or open-host token changes. It pauses while `document.visibilityState` is `hidden`, and it does not send while offline or forced offline. A missing route (`404`/`501`) hides the line immediately. Other errors back off (15s, 30s, 60s, 120s) and then stop. `429` backs off without hiding the line for good.

The Multiplayer section shows one line, `{playing} playing now · {online} in online multiplayer`, in English and German. The line stays hidden while offline or after the endpoint is given up.

## Quick match

A host turns on **Looking for players** in the invite dialog. That publishes `{ hostSessionId, inviteToken }` for one free AI slot. The host heartbeat refreshes a 90 second TTL. The listing is removed when the slot is claimed, the host turns it off, the match is live (a remote human is connected and the game is not paused), or the game is over.

`POST /api/quick-match` claims one open host. Redis does this in one `EVAL`: drop stale scores, `ZPOPMIN` until it finds a host that is not the caller and still has a token, then mark that token claimed for 10 minutes so the host heartbeat cannot list the same token again. `ZPOPMIN` alone would return the caller's own host when they are the oldest entry, so the script puts that entry back and continues. If nothing is open, the response is `{ inviteToken: null }` and the sidebar offers **Host an open match**.

A claimed token joins through the existing invite-link flow (`?invite=`). Two claimers race: only the claim that wins the atomic pop (Redis) or the `onlyIfNew` blob write (fallback) gets the token. Quick match is disabled while offline.

Same-computer play still uses public STUN. Cross-network play still needs `ICE_SERVERS` or `TURN_*`, as documented in the README. The sidebar says so, with a custom tooltip and no native `title` on the new controls.

## Storage choice

The routes are Netlify Edge Functions (`netlify/edge-functions/multiplayer-stats.js`) so heartbeats use the edge invocation quota. Upstash is HTTPS from the edge. This repo opens Netlify Blobs with `getStore` inside the Node signalling function. Bundling that client into the edge function is a poor fit, so when `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` is unset the edge function forwards that one request to `netlify/functions/api.js`. The function uses Blobs: one JSON blob per session for approximate counts, and `onlyIfNew` on a claim key so two joiners cannot both take the same slot. Blob expiry is lazy (stale blobs are deleted on the next heartbeat or claim) because Blobs have no sorted-set TTL. `npm run stun` runs the same rules in memory when Upstash is unset, which is what local two-browser checks use.

Set both Upstash variables in the Netlify UI with scope **Functions** (and Runtime if the UI offers it), for every deploy context including Deploy Previews. The edge function reads them with literal `Netlify.env.get('UPSTASH_REDIS_REST_URL')` and `Netlify.env.get('UPSTASH_REDIS_REST_TOKEN')` calls, then `Netlify.env.toObject()`, then `Deno.env`, then `process.env`. A secret token is still read from `Netlify.env` when `process.env` does not contain it. Do not put them in `VITE_*` variables. Values are captured when the deploy is built, so a variable added after a preview deploy needs a new deploy before `backend` can be `redis`. On a public repository, Netlify's sensitive variable policy can omit secret values from deploys whose git author is not a team member; `backend: "blobs"` with `redisConfigured: false` means this runtime did not receive both variables.

## Performance

The heartbeat is a 45 second timer plus a 1 second signature check that only compares three strings. It does not run on the simulation tick, the animation frame, or entity rendering, and it does not draw on the canvas. The 75 FPS gate is unchanged. No hot-loop allocation was added.

## Local check

With `npm run stun` and `VITE_STUN_HOST=http://127.0.0.1:3333 npm run dev`, `node scripts/verify-multiplayer-stats.mjs` opens two browsers. Both showed `2 playing now · 0 in online multiplayer`, the host dialog toggle listed a free slot, and Quick match connected the joiner (the host sidebar showed that player with Kick). That run uses the signalling helper's in-memory store, which follows the same rules as Redis. Upstash was not configured in the check environment. Blob claims are covered by the unit tests.

## Preview check

`POST /api/presence` on `https://deploy-preview-722--code-for-battle.netlify.app` for commit `bb4730db` returned `backend: "blobs"`, `redisConfigured: false`, `handler: "edge-forward"`. The edge function ran and forwarded because neither runtime saw both Upstash variables. The site environment API lists `IMPRESSUM_CONFIG_JSON` only, and the team shared list is empty.

## Not covered here

Qualifying-hardware 75 FPS measurement is not required for this change because no update/render hot path was modified. A headless browser cannot certify presented FPS.
