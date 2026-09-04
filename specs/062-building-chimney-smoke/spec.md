# Building Chimney Smoke Animation

## Requirements

- Completed buildings with configured chimney smoke spots emit five particles per puff by default, at a configurable interval.
- Particles begin small, expand continuously while rising, and fade gradually over their configured lifetime.
- Smoke drifts with configurable horizontal and vertical wind, strength, animated sway amplitude and sway frequency, plus configurable turbulence.
- The built-in configuration editor exposes particle count, emission interval, lifetime, starting size, growth multiplier, starting opacity, fade curve, rise speed, spread, turbulence, global capacity, and every wind parameter.
- Runtime config changes apply without reloading the game.

## Performance design and verification

The smoke updater runs once per simulation tick and the renderer once per animation frame. At the default cap this is 300 particle updates and up to 300 culled sprite draws per frame (18,000 particle visits per second at 60 FPS and one device-pixel-ratio-scaled sprite draw per visible particle). Wind sway therefore uses one shared sine calculation per update, not one per particle; the loop performs no collection rebuilds, `Set`/`Map` creation, or entity scans. Existing pooled particle objects remain in use.

An opt-in Playwright benchmark exercises the full 300-particle budget and records FPS, smoke-render CPU time, and heap delta:

```sh
PERF_CHIMNEY_SMOKE=1 npx playwright test tests/e2e/buildingChimneySmokePerformance.test.js --project=chromium --reporter=line
```

The benchmark requires at least 50 FPS, at least 80% of same-scene baseline FPS, less than 250 ms aggregate smoke-render CPU over 180 frames, and less than 12 MB heap growth. In the current environment both the before and after live measurements were blocked because Playwright's Chromium executable was absent and the CDN returned HTTP 403 while installing it; no measured FPS/CPU/heap result is claimed.
