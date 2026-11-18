# Stationary battle against the 60 FPS gate

The recorded combined run tested `025915f9`, before the explicit tutorial startup flag was added. The reference workload is the seed-11 200×200 four-party save at 500 starting units. The camera stays on the central battle at DPR 2 and a 950×739 CSS-pixel canvas. Forty-seven player tanks are selected. The construction yards are protected so defeat cannot interrupt combat. The current harness also passes `?tutorial=0`, which skips tutorial initialization before UI creation. The comparison uses normal simulation speed, normal effects, and hardware WebGPU terrain on the Apple M1.

```sh
BENCHMARK_URL=http://127.0.0.1:4192 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_BATTLE_ONLY=1 BENCHMARK_OUTPUT=tmp/unit-heavy/checklist-final-no-tutorial node scripts/benchmark-unit-heavy.mjs
```

## Per-item evidence

The scrolling and stationary numbers are separate scenarios. The stationary pair comparisons use the same save, camera and profiling mode.

| Item | Report |
| --- | --- |
| Collision separation | [Collision measurements](2026-11-18-collision-separation.md) |
| Prepared wreck sprites | [Wreck sprite report](2026-11-18-wreck-sprite-preparation.md) |
| Save restoration | [Save restore report](2026-11-18-save-restore-readiness.md) |
| AI breach search | [AI breach budget report](2026-11-18-ai-breach-budget.md) |
| Movement lookups | [400- and 500-unit report](2026-11-18-live-movement-lookups.md) |
| Service units | [Stationary service-unit report](2026-11-18-service-unit-index.md) |
| Fog visibility | [Stationary fog report](2026-11-18-sparse-fog-visibility.md) |

## Acceptance

The last unprofiled 60-second hardware capture averaged **2.08 callback FPS**, with a minimum of **1 FPS** over one second. Frame p95/p99/max were 983.3/983.6/1,000.0 ms. There were 123 raw intervals over 16.67 ms. Mean CPU update and render submission were 38.55 ms and 3.98 ms. The run reached 25 simultaneous projectiles, finished with 481 units, and reported zero page errors. Raw output is in `tmp/unit-heavy/checklist-final-stationary/result.json`.

The follow-up 60-second capture on `0a8a917a` passed the explicit tutorial flag check. It measured 2.09 average callback FPS, 2 FPS minimum over one second, 967.2/983.5/984.0 ms p95/p99/max, and 42.57 ms mean CPU update. The camera stayed fixed and Chrome verified hardware rendering. The [Chrome presentation trace](2026-11-18-chrome-presentation-trace.md) identifies where the browser GPU process spent its time in the later comparison.

Chrome and Metal verified the M1 hardware GPU. CoreGraphics returned no active physical display ID in this session, so the 60 Hz browser callback cadence is insufficient to certify presented frames. The 60 FPS gate remains open. Physical production-build acceptance, the layered naval case and the complete repeated traversal checks remain pending.
