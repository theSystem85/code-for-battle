# Implement scrolling fixes 1–3

UTC: 2026-11-04T09:20:31.038610+00:00

Harness: Codex desktop. Model: GPT-6; exact deployment/version, reasoning setting, token counts and full task duration are not exposed.

## Prompt

now implement fixes 1-3

## Scope

Implement the preceding response’s fixes: terrain preparation/cache churn, stable water-layer ownership, and nonblocking periodic autosaves. Work on current origin/dev, preserve visuals and bounded memory, and verify on the hardware GPU before drawing performance conclusions.

## Result

Implemented retained terrain pages with bounded admission, stable empty GPU water passes and worker-backed incremental interval checkpoints. Added coherence/cancellation/fallback tests, camera/seam/actual-timer browser coverage and a reproducible hardware-only production diagnostic. Regenerated the pre-existing stale soil atlas to repair its source-alpha test gate.

Local validation: 5,739 unit tests, 5,825 unit/integration tests and six focused headed Chrome checks passed; lint and production build passed. A five-minute M1/Metal capture had zero cold terrain misses and an 8.1 ms maximum render span. Worker encodes stayed off-thread. Independent blank controls reproduce a changing 30/60 FPS browser/device cadence; the 75 FPS requirement is not certified. Larger/high-DPR maps, remaining update/native deadlines and full worst-case acceptance remain open. Five broader E2E declarations also fail against origin/dev; details and exact commands are in the new spec.

Exact model deployment/version, reasoning setting and token usage are unavailable; no estimates are substituted. Full task duration is not yet available at this pre-publication checkpoint.
