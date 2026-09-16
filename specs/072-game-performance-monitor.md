# Game Performance Monitor

## Planned extension — 2026-09-16

The [75 FPS rendering specification](rendering-pipeline-75fps.md) and [detailed design](../performance_improvement.md#8-live-bottleneck-monitor-and-helper-tools) require a separately toggled live function timing list in the overlay, ranked by aggregate self time, with inclusive time/calls/tails, CPU/GPU/memory capability labels, cache/upload/resize counters and bounded storage. Unsupported GPU data must not be represented by residual wait. Disabled detailed profiling must add no timer/allocation/sorting work. These are planned requirements, not current features. Implementation ownership: P00 in [the delegation checklist](../rendering_improvement_todos.md).

## Goal

Provide an opt-in on-device performance recorder for diagnosing normal gameplay on real mobile hardware, where automated benchmark mode may not reproduce the issue.

## Activation and Workflow

1. Open the normal game with `?monitor` appended to its URL.
2. A red circular record button is visible with the sidebar action controls.
   On mobile it is fixed inside the safe viewport above the bottom-right help control, with explicit dimensions that override the landscape action-column width rule.
3. Tap it to start recording, reproduce the slowdown, and tap it again to stop.
4. The game presents a JSON snapshot. Use `Copy` and paste the report into a follow-up issue.

The red control and all per-frame monitoring are absent unless `monitor` is present. The report is also available through `window.getPerformanceMonitorReport()` for Safari Web Inspector.

## Bounded Data

The recorder stores aggregate counters only: sample count, total, minimum, maximum, and slow-frame count for each timing category. Its retained data size is constant regardless of recording duration; it does not keep a frame-by-frame trace.

## Report Contents

- Frame cadence, update, render, minimap, total work, and compositor/wait estimates.
- Terrain/GPU submission, entities, effects, and UI render sub-phases.
- Chunk cache/miss/redraw/fallback counters and GPU terrain mode.
- Browser/device viewport, native and effective canvas DPR, canvas backing-store sizes, JS heap when supported.
- Map dimensions/seed/resource settings/scroll location and current game entity/settings snapshot.
