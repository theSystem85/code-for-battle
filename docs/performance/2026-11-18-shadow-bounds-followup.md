# Shadow draw area follow-up

The previous [canvas attribution](2026-11-18-shadow-source-attribution.md) found that suppressing the 276×276 offscreen shadow sources removed nearly one-second presentation gaps. This follow-up used the same 500-unit save, fixed camera, tutorial disabled, defeat protection, production preview, Apple M1 Metal GPU, Chrome 157, DPR 2 and active Retina display. The browser's blank-page cadence was about 30 Hz. The 30-second captures are diagnostics and cannot certify 60 FPS.

| Mode | Avg presented FPS | Minimum 1 s FPS | p95 / p99 / max (ms) | Outcome |
| --- | ---: | ---: | --- | --- |
| Unit image URLs and ImageBitmap sources suppressed | 2.109 | 1 | 966.6 / 983.3 / 983.3 | 29,945 image draws suppressed, shadows retained |
| Bitmap copies substituted for shadow sources, first | 2.042 | 1 | 966.6 / 983.3 / 983.3 | Seven sources copied, substitution count unavailable in this first run |
| HTML canvas copies substituted for shadow sources | 2.132 | 1 | 966.6 / 983.3 / 983.3 | 14,404 draws substituted |
| Bitmap copies substituted, repeat | 2.105 | 1 | 966.6 / 966.7 / 966.7 | 16,292 draws substituted |
| Transparent 276×276 canvas substituted | 2.144 | 1 | 966.6 / 966.7 / 966.7 | 14,404 draws substituted, shadows invisible |
| Transparent 1×1 canvas substituted | 30.001 | 29 | 33.3 / 33.3 / 83.3 | 187,906 draws substituted, shadows invisible |
| Fixture-specific 70×62 source rectangle, first | 25.326 | 19 | 83.3 / 100.0 / 100.0 | 135,438 draws bounded |
| Fixture-specific 70×62 source rectangle, repeat | 22.206 | 19 | 100.0 / 100.0 / 100.0 | 140,239 draws bounded |
| Normal control after the two bounded runs | 2.192 | 1 | 966.7 / 983.3 / 983.3 | Full scene |

The bounded runs used a 70×62 source rectangle at (108, 98) inside each 276×276 source. A separate development-server sample read the seven encountered offscreen shadow canvases once each. Six had nonzero alpha at x=109–176 and y=101–157, and one had x=112–173 and y=99–158. The sampled rectangle includes those pixels. The size filter and rectangle are specific to this fixture and must not be used as production assumptions. The development source inventory and the production build are separate observations. Source identity in production was inferred from dimensions.

The transparent full-size and tiny-source runs suggest draw extent contributes to the stall. They change the visible scene. The bounded draw preserves the sampled alpha area, but a visual parity comparison has not been run, and filtering, fractional placement, settings, and other unit types need verification. Simulation advanced differently in each mode and surviving populations diverged, so these runs quantify diagnostic behavior rather than a production FPS improvement. A bitmap copy alone did not resolve the slowdown.

The existing script supports `BENCHMARK_HOLD_FOREGROUND=unit-images|bitmap-shadows|html-shadows|transparent-shadows|tiny-shadows|crop-shadows|stacks`. It counts suppressed or substituted draws in `result.json`. The `stacks` mode reads shadow pixels and is an intrusive diagnostic. Run each test on verified hardware using the production setup and commands in the [prior report](2026-11-18-shadow-source-attribution.md), changing the mode and output directory. The bitmap run waits four seconds after resuming to prepare observed sources. The first bitmap attempt failed before capture because preparation started while the game was paused; its setup was corrected and the failure contributed no FPS result.

A candidate implementation should compute tight bounds once while preparing each shadow cache entry, preserve its offset and all nonzero alpha pixels, handle settings changes and old sources, and demonstrate pixel parity before benchmarking the normal game. Preserve full shadow quality. The reference 60 FPS acceptance and remaining benchmark reliability, per-tick CPU and matched cold-traversal work remain open in the [checklist](2026-11-18-next-performance-checklist.md).

Lint passed. The full unit suite passed 5,901 cases and reproduced the existing `U05433` map-sprite alpha failure previously confirmed on the unmodified dev baseline.
