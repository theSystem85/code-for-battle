# Prompt history

UTC timestamp requested: 2026-10-15T21:30:00Z
Harness: Codex via API
Model: GPT-6 (exact model version and reasoning level are not exposed in this session).
Token counts and total task duration are unavailable; no estimates recorded.

## User prompt

You are working in a git repository checked out at the current directory (branch codex/sse-extension-part-a-sidebar-exp-20261015-232449-e1fea3, based on codex/implement-sprite-sheet-editor-ss-20261015-181843-069a21).
Follow the repository's own instructions (AGENTS.md etc.) for code style, docs and tests, but do not commit, push, or change git remotes; the operator commits for you.
Stay inside this directory. Network access is disabled in the sandbox. Do not add secrets or credentials.

TASK:
SSE extension part A (sidebar, export, viewport). Implement in the /sse Sprite Sheet Editor:
1. Sidebar button "New sheet" that creates a new blank black sprite sheet (choose name, grid tile size, columns, rows) and makes it the target. API: __SSE__.newSheet({name, tileSize, cols, rows}).
2. The info bubble/panel in the left sidebar for the loaded sheet shows its current compression level (lossless or lossy quality %, detect from metadata or the loaded file; "unknown" if not determinable). Fix the bubble being cropped/hidden by the SSE canvas (z-index, overflow, stacking context) so it renders fully above the canvas.
3. Sidebar "Export" section with an Export button that downloads the WebP sprite sheet image plus a JSON metadata file (grid, sprite rects in tiles and px, tags, name, compression). A compression control: "Lossless" checkbox checked by default, and a quality slider (with label/value) enabled only when lossless is off. Export default must be lossless. Put the encoding/metadata logic in a pure, unit-testable module. API: __SSE__.exportSheet({lossless=true, quality}) returning {webpBlob|dataUrl, json}.
4. "Clear tiles" option: user selects one or more target tiles (click / shift-click or drag selection) and overdraws them fully with the background colour, removing any placed sprite metadata on those tiles. API: __SSE__.clearTiles([{col,row},...]).
5. Both the target sheet view and the source image view support two-finger trackpad scroll (wheel deltas pan), pinch zoom (ctrl+wheel and touch pinch via pointer events), and touch two-finger pan. Zoom anchored at the cursor/pinch centre.
6. The split border between source and target panes is draggable (pointer events, also touch) to resize; persist ratio in localStorage.
7. Restyle the SSE sidebar to match the game's expanded left sidebar: reuse its existing CSS classes/components from styles/ (inputs, selects, checkboxes, sliders with labels, expand/collapse sections). Import the existing stylesheets rather than duplicating. Clean up margins and paddings for consistent spacing.
Add unit tests: export defaults to lossless; clearTiles clears pixels and metadata. Extend the SSE Playwright e2e spec (find it under tests/e2e) to cover new sheet + export button presence, if feasible.
Context: this is PR #751 of code-for-battle. The Sprite Sheet Editor (SSE) has a light standalone route `/sse` (sse.html, src/sseApp.js and the SSE modules under src/ui, find them with rg "sse|spriteSheetEditor"), a click-to-isolate import onto an extendable grid target sheet, and an agent API `window.__SSE__` that fires the same controller events as the UI. Skill doc: skills/extend-sprite-sheet/SKILL.md.
Global rules: English only. Never use HTML `title` attributes. Keep `window.__SSE__` in sync: every new UI action must have an API method that goes through the same controller code path and fires the same events as the UI button. Update skills/extend-sprite-sheet/SKILL.md for every new action/API. Add a docs/changes/2026-10-15-sse-<topic>.md note and a prompt-history/2026-10-15T21-30-00Z_<topic>.md entry (follow existing format). Do not bump package version (stays 0.55.0) but append to features/0.55.0.json if that is the repo convention. No top-level `await` anywhere (build targets chrome87/safari14). The SSE never overwrites existing repo sheets; it only creates new files on export/download. Run `npm run lint` and the unit tests for touched areas; `npm run build` must pass.

Repository instructions supplied with the request apply: record a dedicated change note, this English prompt entry, a new feature spec and versioned release notes; run all unit tests, changed-file lint fixes, full lint and a build; preserve game hot-path performance and do not claim headless certification of the 75 FPS hardware gate. Do not commit or push. Final response must include a conventional commit message with descriptive bullets for the operator.
