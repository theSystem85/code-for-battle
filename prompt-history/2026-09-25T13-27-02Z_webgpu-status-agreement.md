# 2026-09-25T13:27:02Z

Grok 4.7, Cursor cloud agent (Grok 4.7). Token counts and reasoning-token totals were not exposed by this harness, so they are omitted. The task ran from 13:14 UTC to about 13:30 UTC.

## Prompt

Problem: On the user's Apple Silicon Mac (Chrome), after #703 was merged to main, the Settings menu renderer status says "Using WebGPU." but the performance widget (FPS overlay) shows "Renderer: WebGL". The two must agree and reflect what actually draws the terrain.

Context from a quick read of main (treat as a non-binding hypothesis; investigate yourself):
- The widget (src/ui/fpsDisplay.js updateRendererRows) shows gameState.renderStats.gpuOverlay.backend, which src/rendering/renderer.js sets per frame. Each frame WebGPU is tried first; if GameWebGPURenderer.render() returns false (status not 'ready', validationPending, syncTextures() false, no instances, needsRestore, etc.), the same frame falls back to WebGL and the overlay says WebGL.
- Settings text comes from describeRendererBackendStatus() in src/rendering/rendererBackendSelection.js, which returns "Using WebGPU." whenever WebGPU was requested and the active backend is not recorded as WebGL, and noteActiveRendererBackend('webgpu') seems to stick after one successful WebGPU frame even if later frames fall back. So settings may be optimistic while WebGPU silently never (or rarely) draws.

Goals / done when:
1. Settings status and the performance widget derive from the same source of truth (the actual per-frame/recent backend), so they cannot disagree for more than a moment.
2. Distinct honest states: WebGPU starting/initializing (show something like "WebGPU starting…"), WebGPU active, WebGPU requested but frames falling back to WebGL (with the reason), WebGL chosen, WebGPU unavailable. Keep en/de translations in sync for any new strings.
3. Whenever WebGPU hands a frame to WebGL, record the reason (e.g. not ready, validation pending, texture sync failed, no instances, restore) — show the latest reason in the widget's renderer row (keep the widget narrow; it grows downward, not wider) and log it once per reason change to the console with a `[WebGPU]` prefix (no per-frame spam).
4. Investigate whether there is a real bug that keeps WebGPU from drawing after a successful init (e.g. why render() would keep returning false on Apple Metal); fix it if you find a clear cause, otherwise just make the reason visible so the user can report it.
5. Unit tests for the status description logic and the fallback-reason tracking; run eslint on changed files and npm run test:unit.

Repo rules (also in AGENTS.md): no merge commits ever; if main moves, `git fetch && git rebase origin/main` and push with `--force-with-lease`. Follow AGENTS.md backlog/TODO conventions. Open a new PR against main (PR #703 is already merged). Do not merge the PR. In the PR description, tell the user exactly what to look at in the widget/console on their Mac to see which fallback reason occurs.
