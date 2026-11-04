# Custom sprite runtime slowdown

UTC: 2026-11-04T21-57-00Z
Harness: Codex desktop. Exact deployed model/version, reasoning level and token telemetry are unavailable; no values are invented.

## Prompt

Usage limit was reset; continue. The game was initially perfectly smooth with custom sprites off. Turning them on remained smooth initially, then became very slow after about ten seconds. Investigate whether memory shortage causes a switch to streaming mode.

Clarification: the tested application was localhost.

The replacement AGENTS.md instructions apply. Subsequent changes go directly to dev with required validation; preserve local work. The previous rendering PR #805 has already been merged and deployed. Continue the runtime-toggle investigation on current origin/dev.

## Verification checkpoint

At 2026-11-04T22:35:36.735457+00:00, elapsed wall time since the first available continuation clock (2026-11-04T21:50:37+00:00) is 44m 59s. Final Git/deployment verification occurs after this checkpoint. Exact model deployment/version, reasoning level and input/output/reasoning token counts are unavailable. System identification only says Codex based on GPT-6; this is not presented as an exact deployed model version.

Reproduced the off→on default-sheet transition on native M1 hardware: explicit invalidation discarded 169 prepared ground pages and never published a replacement, while GPU ground usage fell to zero with spare budget. Water still reported WebGPU. The second on-minute fell to 44.97 FPS / 183.3 ms p99. Fixed the configuration boundary, final-image readiness, loop/pause preservation, replacement publication and restore callbacks that discarded it.

Full checks pass: 5,751 unit tests, 5,837 unit/integration tests, lint/fix, production build and 13 focused hardware-browser cases. Two serial native-DPR five-minute on-runs stay near 60 FPS, including the exact reported port 5137. Corrected collector window bounds exclude artifact-collection frame samples. Isolated actual CPU/render/GPU stalls remain, including a 206.9 ms render span; the 60-Hz display cannot certify 75 FPS. Full evidence and outstanding acceptance are in the new custom-sprite lifecycle spec. Follow the replacement workflow preference: push the fix directly to dev, no new PR.
