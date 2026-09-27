# 2026-09-27T22:34:00Z

Grok 4.7 in Cursor Cloud Agent. Token counts and elapsed time were not available to record.

## Prompt

FYI: the Netlify project now has UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN set (scopes functions + runtime, all deploy contexts; the token is marked secret). A free Upstash Redis DB in Frankfurt (eu-central-1) backs it. So the deploy preview should use the real Redis path; please verify the Redis path on the preview (not just the Blobs fallback), e.g. via a debug field in the /api/presence response like backend: 'redis' | 'blobs', and include that in your report.

## Continuation

Grok 4.7 in Cursor Cloud Agent, resumed on the same prompt. Token counts are not available. The preview check finished at 2026-09-27T22:49:01Z.

`POST /api/presence` on deploy preview 722 for `bb4730db` returned `backend: "blobs"`, `redisConfigured: false`, `handler: "edge-forward"`. The edge function ran. Both Upstash variables were empty in that runtime, so the Node function used Blobs. The site env API lists only `IMPRESSUM_CONFIG_JSON`.
