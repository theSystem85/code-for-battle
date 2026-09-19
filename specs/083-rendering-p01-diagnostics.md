# 083 — P01 rendering benchmark and diagnostic tooling

Status: implemented 2026-09-20.

## Scope

P01 adds opt-in tooling only. It does not change the renderer, game state, visual assets, DPR, animation cadence or production defaults. The existing lower-threshold mobile and iOS scenarios remain historical diagnostics and are not strict acceptance tests.

## Evidence contract

`tests/e2e/renderingPipeline75Fps.test.js` records a cold startup CDP sample and a steady two-lap timed route. The route traverses a serpentine full-map path, reverses direction between bands/laps, checks completion, and reports independent animation-frame intervals. The report includes mean FPS, p95/p99/max frame time, missed `1000/75` ms deadlines, per-window FPS, route distance and the scene readiness boundary.

The strict deadline is `13.333... ms`. Acceptance mode is enabled only with `PERF_RENDERING_PIPELINE_ACCEPT=1`; it additionally requires a non-headless run, a known display refresh rate of at least 75 Hz, and zero missed deadlines. A headless run, unknown refresh, software fallback or display below 75 Hz is labeled `diagnostic-only` and cannot pass physical certification.

CDP CPU sampling is explicitly labeled intrusive and captures `startup-cold` and `steady-repeat-laps` separately. It must not be used as the FPS-certification measurement. The read-only audit captures transformed image draws, canvas resize events, resource decoded bytes and transfer bytes without enabling any production audit path.

## Visual capture

`tests/e2e/renderingVisualParity.test.js` emits WebP quality-85 golden artifacts for shoreline/biome, cliffs/roads and dynamic-entity camera states plus a stationary repeat capture. The manifest records viewport, DPR, capture format and the requirement to compare matched camera/time/backend sequences. Artifacts are generated under Playwright output and are not committed as repository binaries.

## Commands

Diagnostic route and profiles:

```sh
PERF_RENDERING_PIPELINE=1 PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npx playwright test tests/e2e/renderingPipeline75Fps.test.js --project=chromium --reporter=line --workers=1
```

Strict acceptance on a qualifying physical display:

```sh
PERF_RENDERING_PIPELINE=1 PERF_RENDERING_PIPELINE_ACCEPT=1 PLAYWRIGHT_HEADED=1 PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npx playwright test tests/e2e/renderingPipeline75Fps.test.js --project=chromium --reporter=line --workers=1
```

Visual golden capture:

```sh
PERF_RENDERING_VISUAL=1 npx playwright test tests/e2e/renderingVisualParity.test.js --project=chromium --reporter=line --workers=1
```

The current environment is not a qualifying physical 75 Hz presentation measurement unless the command is run headed on verified hardware; headless/software output remains diagnostic evidence.

