- [x] **Bug: exclude streets from coastal sand**
  Paved coastal tiles, including airstrip streets, no longer seed sandy water gradients or receive sand on their water underlays. Natural coastlines retain their gradients.
  Spec: [Coastal Shallows and Graphics settings](../../specs/137-coastal-shallows-graphics.md)

The shared depth field excludes pavement during topology preparation. GPU water instances receive fully opaque corner depths for paved hosts; Canvas fallback omits their sand patterns. No frame-time scans, draw calls, shader work, or DPR-dependent work were added. Preparation work remains independent of entity count.

Hardware GPU / 75 FPS acceptance remains pending on Patrick's reference device; no GPU or performance benchmarks were run in this environment.

The full-suite check exposed leaked accordion test timers firing after jsdom teardown. The accordion tests now drain their timers after each test to keep suite verification deterministic; application behavior is unchanged.

The coastal settings browser test waits for the loading screen to disappear before using Settings, including after reload, so it does not interact with controls during initialization.

Verification: `npm run lint:fix:changed` and `npm run lint` passed. The initial `npm run test:unit -- --maxWorkers=4` run passed 5,352 tests, with four release-script tests blocked by sandboxed Git subprocesses; those passed with subprocess permission. After fixing the accordion test timer leak, `npm run test -- --maxWorkers=4` passed all 5,442 unit/integration tests across 324 files. `npm run build` passed. Coastal Graphics persistence E00207 passed using system Chromium through a temporary Playwright config. Full Playwright and hardware rendering/performance coverage were skipped because no hardware GPU is verified.
