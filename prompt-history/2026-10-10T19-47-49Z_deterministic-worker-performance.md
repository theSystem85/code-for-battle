# Prompt history

UTC start: 2026-10-10 19:47:49 UTC
Harness: Codex via API
Model: GPT-6 (exact deployment version and reasoning level are not exposed).
Token counts: unavailable; omitted rather than estimated.
UTC finish: 2026-10-10 20:37:13 UTC
Duration: 49m24s through final verification and documentation.

## User request

the biggest bottleneck is CPU usage afaik especially for enemy AI usage and when or before units fire at each other and before showing the explosion sprite sheet and also the bullet impact explosion. Assess if it is better to move these into separate Web Workers but ensure to keep deterministic and synced behaviour of the app for multiplayer and replay feature. Also assess if it is feasible to move physics to Web Worker or scatter the computation more evenly on the main thread. Implement your best solution for each issue.

## Outcome

Explosion-sheet preparation runs in a pure presentation worker before gameplay; authoritative AI/physics remain synchronous, with deterministic AI phases and reduced collision/projectile churn. All 4,683 unit tests, lint and build passed; four development and two final production focused browser tests passed. The user accepted the improvement and requested stopping further optimization. Physical 75 FPS certification and the same broad replay divergence present in the baseline remain outstanding.
