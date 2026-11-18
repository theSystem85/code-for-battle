# Stationary battle benchmark validity

The benchmark now records whether a tutorial overlay appeared during initial startup via a temporary DOM observer, verifies the expected fixture SHA-256 when supplied, and reports failures for an insufficient army, sampled pause/defeat/background/tutorial state, camera drift, stalled simulation, absent visible Apache rockets or impacts, page errors, and insufficient samples. Invalid results are written to `result.json` with `validityFailures` before the process exits nonzero. During capture the camera and scene checks run at game-frame reports; they cannot detect all transients between reports. Rocket and impact checks establish presence during the run, not sustained activity throughout it.

The active Apple M1 hardware GPU, Retina display and 60 Hz blank-page Chrome cadence were verified. A 15-second control using fixture SHA-256 `65acf030a1655055d1ed954fbdf9038919eb88e69e59b877f8427f33cdc7e1ce` returned no validity failures, saw no startup tutorial and recorded 11 scene samples, 16 visible rockets and 16 impact centers at peak. The normal game averaged 2.173 presented FPS and 1 FPS in its worst second. A second run supplied an intentionally incorrect expected SHA-256. It saved its result and exited nonzero with `fixture-hash-mismatch`.

```sh
BENCHMARK_URL=http://127.0.0.1:4193 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_EXPECT_FIXTURE_SHA256=65acf030a1655055d1ed954fbdf9038919eb88e69e59b877f8427f33cdc7e1ce BENCHMARK_IMPORT_SAVE=1 BENCHMARK_BATTLE_ONLY=1 BENCHMARK_BATTLE_DURATION_MS=15000 BENCHMARK_COMPOSITOR_TRACE=1 BENCHMARK_OUTPUT=tmp/unit-heavy/validity-control node scripts/benchmark-unit-heavy.mjs
```

Unit tests cover incorrect fixture, tutorial, stalled simulation, absent impacts, backgrounding and camera drift. They exercise the validation function with synthetic inputs, not actual browser interruptions. Outstanding safeguards include a host-side callback timeout with partial trace, continuous focus and defeat observation, sustained combat checks, portable fixture creation and a two-checkout reproduction.

Lint and the seven focused validity and gap-report tests passed. The full unit suite passed 5,908 tests and reproduced the existing `U05433` map-sprite alpha failure.
