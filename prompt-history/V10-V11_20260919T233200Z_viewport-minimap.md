# 2026-09-19T23:32:00Z

Model: Cursor Cloud Agent using GPT-5.6 Sol.

## Prompt

Implement only Wave 2 rendering steps V10 and V11 in an isolated worktree. Limit changes to canvas management, rendering utilities, minimap rendering, viewport helper modules, and corresponding unit tests. Cache logical/backing canvas dimensions on layout events, publish reusable `FrameViewport` and density-generation state, preserve fixed scrolling quality, and avoid frame-path layout reads or allocations. Prepare destination-size minimap terrain/resource/fog layers with independent revisions, preserve live markers/viewport/video/radar behavior, and attribute base, fog, video, and entity marker profiler spans separately. Do not edit shared docs/TODO/manifests, renderer/game-loop/orchestrator files, or `layoutMetrics.js`; do not run the 75 FPS benchmark. Run changed-file lint and the complete unit suite, fix root causes, and commit the worktree.
