# Spec 069: iOS Simulator Benchmark E2E

## Goal

Add an end-to-end performance test that runs the existing in-game benchmark inside Safari on the actual iOS Simulator and fails when reported average FPS is below the mobile target.

## Requirements

- The test must be opt-in so normal Playwright runs do not launch Xcode Simulator.
- The test must start the configured emulator script (`npm run emulator` by default).
- The test must target `iPhone 13 Pro Max` by default, boot that specific Simulator device, wait for the app runtime, then open Safari on that device's UDID with an instrumented benchmark URL.
- The instrumented benchmark URL must use at least a `100x100` map by default so chunk loading and full-map rendering are exercised.
- The app must run the existing benchmark flow, not a separate synthetic FPS sampler.
- The app must report the benchmark result back to the Playwright process.
- The test must fail when the rounded displayed average FPS is below `55` by default, with `IOS_BENCHMARK_MIN_AVG_FPS` available to raise the gate back to the 60 FPS target.

## Implementation

- `npm run test:e2e:ios-benchmark` sets `IOS_EMULATOR_BENCHMARK=1` and skips the normal Playwright `webServer` because the emulator script owns app startup.
- `npm run emulator` defaults `IOS_SIMULATOR_DEVICE` to `iPhone 13 Pro Max`, accepts `IOS_SIMULATOR_UDID` when the E2E has resolved a specific device, and does not open the plain app URL in benchmark mode because the E2E opens the instrumented benchmark URL after Vite is reachable.
- `tests/e2e/iosSimulatorBenchmark.test.js` resolves an available `iPhone 13 Pro Max` simulator, boots its UDID, starts a local HTTP collector, starts the emulator command, waits for `http://localhost:5173`, opens Simulator Safari via `xcrun simctl openurl <UDID>`, and asserts the reported in-game benchmark result.
- If the emulator command exits before the app server is reachable, the test fails immediately with the captured emulator output instead of timing out while the Simulator stays on the home screen.
- The assertion rounds the raw in-app `averageFps` before comparing to the configured threshold so values like `54.981` match the displayed 55fps result instead of failing on sub-frame sampler noise.
- `src/benchmark/benchmarkRunner.js` supports `?e2eIosBenchmark=1&benchmarkReportUrl=...&benchmarkDurationMs=...` to auto-run the existing benchmark and POST the resulting benchmark payload.

## Configuration

- `IOS_EMULATOR_SCRIPT`: command used to start the simulator and app. Default: `npm run emulator`.
- `IOS_SIMULATOR_DEVICE`: simulator device name. Default: `iPhone 13 Pro Max`.
- `IOS_SIMULATOR_RUNTIME`: optional runtime substring used to choose among multiple matching devices.
- `IOS_EMULATOR_APP_URL`: app URL to wait for and instrument. Default: `http://localhost:5173`.
- `IOS_BENCHMARK_DURATION_MS`: benchmark duration. Default: `60000`.
- `IOS_BENCHMARK_MAP_SIZE`: square map size in tiles. Default: `100`.
- `IOS_BENCHMARK_MIN_AVG_FPS`: required average FPS. Default: `55`.
- `IOS_BENCHMARK_SEED`: map seed for the run. Default: `4`.
- `IOS_BENCHMARK_PLAYERS`: number of players. Default: `2`.

## Notes

- The test requires macOS with Xcode Simulator available.
- If `iPhone 13 Pro Max` is missing, install an iOS Simulator runtime in Xcode (`Xcode > Settings > Platforms > iOS`) or run `xcodebuild -downloadPlatform iOS`, then create the device with `xcrun simctl create "iPhone 13 Pro Max" com.apple.CoreSimulator.SimDeviceType.iPhone-13-Pro-Max com.apple.CoreSimulator.SimRuntime.iOS-17-0`.
- The test is skipped unless `IOS_EMULATOR_BENCHMARK=1` is set.
- This verifies real Simulator Safari rendering, but it still depends on the host machine and simulator load, so CI usage should run on stable dedicated macOS hardware.
- `simctl boot` can print an already-booted Simulator warning through the package script; that warning is tolerated by the script and is not a test failure by itself.
