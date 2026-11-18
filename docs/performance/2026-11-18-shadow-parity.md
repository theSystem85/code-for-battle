# Bounded shadow pixel parity

The diagnostic in `scripts/performance/shadow-bounds-parity.mjs` loads the 500-unit save through the UI on a headed Chrome 157 development build, with `?tutorial=0`. The Apple M1 hardware GPU and active Retina display were verified. It gathers actual shadow mask drawers for each ground-unit type present, generates shadow canvases, finds all nonzero alpha pixels, and expands those bounds by two source pixels. It then compares the full canvas draw with a source-rectangle draw at the same destination coordinates over an opaque background.

The matrix covered seven fixture types (`tank-v2`, `tank-v3`, `howitzer`, `rocketTank`, `ambulance`, `tankerTruck`, `recoveryTank`), four shadow settings (current default, minimum, maximum, and a rotated intermediate setting), DPR 1 and 2, and destination fractions 0, 0.25 and 0.5. All **168 cases** had zero different RGBA channels. No cases were empty and no page errors occurred.

The minimum setting requests direction zero; the existing normalization treats zero as its default direction, so this case does not test a zero-degree direction. The result covers the seven fixture masks, one background, default smoothing and these positions. It does not establish parity for every unit, setting, rotation, canvas transform, browser or graphics device. It also does not test cache invalidation or an actual game change. Readbacks and extra temporary canvases are diagnostic only.

```sh
BENCHMARK_URL=http://127.0.0.1:4192 BENCHMARK_FIXTURE=tmp/unit-heavy/checklist-movement-500-before/fixture.cfb BENCHMARK_OUTPUT=tmp/unit-heavy/shadow-bounds-parity node scripts/performance/shadow-bounds-parity.mjs
```

The fixture-specific bounded-draw hardware FPS comparisons remain in the [shadow follow-up](2026-11-18-shadow-bounds-followup.md) and [60 Hz throughput report](2026-11-18-simulation-throughput.md). A production implementation must calculate bounds for each prepared cache entry, preserve the correct offsets and pixels through settings changes, and be measured with normal full-quality rendering.

Lint and script syntax checks passed. The full unit suite passed 5,903 cases and reproduced the previously documented `U05433` map-sprite alpha failure.
