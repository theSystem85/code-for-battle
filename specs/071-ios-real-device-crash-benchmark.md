# iOS Real-Device Crash Benchmark

## Goal

Add a separate benchmark path for a physical iPhone because the iOS Simulator benchmark does not reproduce the real iPhone 13 Pro Max crash where the map renders, turns black, reloads, and then the browser tab dies.

## Requirements

- Keep the existing iOS Simulator benchmark separate.
- Add a real-device E2E script that starts the local app server and a telemetry collector.
- The test must print a URL that can be opened on a real iPhone on the same network.
- The benchmark map must be at least `100x100` tiles.
- The real-device benchmark URL must auto-run the existing in-game benchmark.
- The benchmark must auto-scroll the map during the run so chunk loading/rendering is exercised.
- The app must send heartbeat telemetry while running, not only a final result.
- The test must fail when:
  - no phone heartbeat arrives,
  - no final result arrives after heartbeats,
  - the page reloads/restarts during the run,
  - the final benchmark result is not successful,
  - average FPS is below the configured threshold,
  - black terrain samples exceed the configured ratio,
  - white street samples exceed the configured ratio.

## Scripts

- Simulator: `npm run test:e2e:ios-simulator-benchmark`
- Real device: `npm run test:e2e:ios-real-benchmark`

## Real iPhone Debug Setup

1. Connect the iPhone to the Mac with USB or put both devices on the same Wi-Fi.
2. On the iPhone, enable `Settings > Safari > Advanced > Web Inspector`.
3. On the Mac, enable Safari's Develop menu via `Safari > Settings > Advanced > Show features for web developers`.
4. Run `npm run test:e2e:ios-real-benchmark`.
5. Open the printed `REAL_IOS_BENCHMARK_URL` on the iPhone.
6. Inspect the page from Mac Safari via `Develop > <iPhone name> > <page URL>`.

## Notes

- Playwright cannot directly automate real iPhone Safari/Chrome the same way it controls desktop Chromium or iOS Simulator Safari.
- The real-device test therefore uses a manual-open handshake plus in-page telemetry. A browser crash or tab death appears as missing final telemetry after heartbeats and fails the test with the last received sample.
