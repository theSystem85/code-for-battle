- [ ] **Fire system** — Add fire engines, four-engine departments, spreading tile fires, damage, water service, rendering and simulation/persistence/control integrations. Audio download and final visual/hardware/browser acceptance remain open.
  Spec: [Fire system](../../specs/fire-system.md)

Validation: the full unit sweep passed 361 files / 5,726 tests (`npm run test:unit -- --maxWorkers=2`). A subsequent focused save/network/fire run passed 105 tests, including the added real save/load regression for fire timers, water, home station, routing timer and shared smoke wind. Browser E00262 passed with installed system Chromium. Production build and sprite-tier verification passed. Earlier failures from stale config mocks and concurrently overloaded UI setup hooks were resolved; assertions and hook timeouts were retained.

Remaining: the bundled fire, hose and ready clips are registered and played. See [Fire audio and replay determinism](2026-11-19-fire-audio-and-replay.md). Hardware frame-rate acceptance and a full manual multiplayer playthrough remain pending. The feature stays open until those are done.
