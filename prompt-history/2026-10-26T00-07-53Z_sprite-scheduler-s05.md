# 2026-10-26T00:07:53Z

Model: Codex using GPT-5.6 Sol.

## Prompt

Implement only sprite-streaming lane S05 on the `dev` baseline at S00 commit `ed5486d7`. Extend the idle asset queue with demand priorities, bounded aging, generation cancellation, deduplication, retries, concurrency and byte backpressure, idle/foreground-slack handling, and bounded async completions. Add a camera-demand scheduler that coalesces snapshots, pauses optional work while moving, resumes after settled hysteresis, and bounds obsolete demand without per-frame map/set creation. Do not edit integration-owned rendering, startup, prepared-registry, display/settings, package, build, ownership-list, or manifest paths. Preserve critical pre-readiness requests, document any proposed integration patch, add focused unit tests, run the required lint and scoped tests, and use English and a conventional commit.
