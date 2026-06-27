# Spec 069: iOS Simulator Benchmark E2E

## Goal

Add an end-to-end performance test that runs the existing in-game benchmark inside Safari on the actual iOS Simulator and fails when reported average FPS is below the mobile target.

## Requirements

- The test must be opt-in so normal Playwright runs do not launch Xcode Simulator.
- The test must start the configured emulator script (`npm run emulator` by default).
- The test must wait for the app runtime, then open Safari in the booted simulator with an instrumented benchmark URL.
- The app must run the existing benchmark flow, not a separate synthetic FPS sampler.
- The app must report the benchmark result back to the Playwright process.
- The test must fail when the rounded displayed average FPS is below `55` by default, with `IOS_BENCHMARK_MIN_AVG_FPS` available to raise the gate back to the 60 FPS target.

## Implementation

- `npm run test:e2e:ios-benchmark` sets `IOS_EMULATOR_BENCHMARK=1` and skips the normal Playwright `webServer` because the emulator script owns app startup.
- `tests/e2e/iosSimulatorBenchmark.test.js` starts a local HTTP collector, starts the emulator command, waits for `http://localhost:5173`, opens Simulator Safari via `xcrun simctl openurl booted`, and asserts the reported in-game benchmark result.
- The assertion rounds the raw in-app `averageFps` before comparing to the configured threshold so values like `54.981` match the displayed 55fps result instead of failing on sub-frame sampler noise.
- `src/benchmark/benchmarkRunner.js` supports `?e2eIosBenchmark=1&benchmarkReportUrl=...&benchmarkDurationMs=...` to auto-run the existing benchmark and POST the resulting benchmark payload.

## Configuration

- `IOS_EMULATOR_SCRIPT`: command used to start the simulator and app. Default: `npm run emulator`.
- `IOS_EMULATOR_APP_URL`: app URL to wait for and instrument. Default: `http://localhost:5173`.
- `IOS_BENCHMARK_DURATION_MS`: benchmark duration. Default: `60000`.
- `IOS_BENCHMARK_MIN_AVG_FPS`: required average FPS. Default: `55`.
- `IOS_BENCHMARK_SEED`: map seed for the run. Default: `4`.
- `IOS_BENCHMARK_PLAYERS`: number of players. Default: `2`.
- `IOS_BENCHMARK_MAP_SIZE`: map size. Default: `40`.

## Notes

- The test requires macOS with Xcode Simulator available.
- The test is skipped unless `IOS_EMULATOR_BENCHMARK=1` is set.
- This verifies real Simulator Safari rendering, but it still depends on the host machine and simulator load, so CI usage should run on stable dedicated macOS hardware.
- `simctl boot` can print an already-booted Simulator warning through the package script; that warning is tolerated by the script and is not a test failure by itself.
