# Remaining rendering fixes 4–6

UTC: 2026-11-04T16:49:33.286728+00:00
Harness: Codex desktop. Model: GPT-6; exact deployment/version, reasoning setting and token counts are unavailable. Task duration will be recorded from the available clock.

## Prompt

The rendering performance is still very bad, as if nothing changed. The tests looked good, but the issue also occurs in other browsers/devices. Implement the other leftover fixes proposed earlier (fixes 4–6).

Clarification: it also occurs in a new incognito game with default settings.

## Scope

Repair/validate WebGPU compilation (P4), remove decoration configuration normalization/serialization from render lookups (P5), and diagnose/reduce measured canvas/allocation/GC churn with bounded lifecycle ownership (P6). Use current origin/dev and verify default fresh games at DPR 1 and DPR 2 on the hardware GPU; do not infer a browser-specific root cause from earlier limited measurements.

## Implementation and verification checkpoint

Recorded at 2026-11-04T18:35:49.922244+00:00. Elapsed since the prompt-history start: 1h 46m 16s through this checkpoint. Final PR/deployment wall time occurs after this commit and is not yet available. Harness: Codex desktop. The session only identifies the GPT-6 family; exact deployed model/version, reasoning level and input/output/reasoning token telemetry are not exposed, so no exact model or token figures are invented.

Implemented WebGPU WGSL validation/recovery, write-boundary decoration revisions, bounded raster pools and retained GPU presentation of the existing oversized-map streaming raster. Removed the ten-second startup preparation race; loading waits for terrain and GPU upload readiness. Added hardware-only browser coverage for delayed startup, pixel parity at four DPRs, real device recovery and mutable-raster revisions.

On the verified Apple M1 hardware GPU at native DPR 2, the five-minute production diagnostic stays at 59.77–60.00 FPS instead of collapsing toward 22 FPS; a separate hardware WebGL minute measures 59.85 FPS. Isolated CPU/GPU deadline misses and a 200 ms frame remain. The 60-Hz display cannot certify the strict 75-FPS requirement. Full evidence, remaining acceptance work and exact commands are in `specs/2026-11-04-remaining-rendering-fixes.md`. Full unit/integration suites, lint, build and the focused serial browser suite pass; earlier intermittent publication failures are retained in the report.
