# Prompt history

UTC recorded: 2026-10-15T16:26:58Z
Harness: Codex.
Model identity exposed by the session: GPT-6. Exact deployed model variant/version and reasoning level are not exposed. Exact input, visible-output and reasoning token counts and total task duration are unavailable; no estimates are supplied.

## User request

You are working in a git repository checked out at the current directory (branch codex/implement-sprite-sheet-editor-ss-20261015-181843-069a21, based on main).
Follow the repository's own instructions (AGENTS.md etc.) for code style, docs and tests, but do not commit, push, or change git remotes; the operator commits for you.
Stay inside this directory. Network access is disabled in the sandbox. Do not add secrets or credentials.
TASK:
Implement Sprite Sheet Editor (SSE) light /sse route, click-to-isolate extend-sheet workflow, matching Agent API, and skills/extend-sprite-sheet/SKILL.md for code-for-battle.

Read AGENTS.md and follow all repo rules: English only; conventional-commit intent (operator commits); docs/changes date-prefixed note; English prompt-history entry naming exact Codex model if known; specs for the new feature; bump to version 0.55.0 in package.json, package-lock.json root, features/0.55.0.json (short user-facing feature line), and run node scripts/generate-version.js if present; never use HTML title attributes; do not weaken lint. Network is disabled in your sandbox and node_modules may be missing — write code and tests carefully; the operator runs npm ci, lint, unit/e2e afterwards and will send failures.

Requirements (see CONTEXT for file paths and existing SSE drop/#648 details):

1) LIGHT /sse ROUTE: Dedicated UI route /sse that opens ONLY the Sprite Sheet Editor without the full game boot (no loading screen asset pipeline, no unit maps, no map gen, no WebGPU full preload). Prefer a lightweight sse.html + small entry module that reuses SSE DOM/CSS and initSpriteSheetEditor (or initStandalone…), with Vite rewrite + Netlify redirect. Production URL after deploy: https://code-for-battle.netlify.app/sse. Keep the existing in-game modal path working.

2) EXTEND-SHEET WORKFLOW in SSE UI (build on file-drop, do not rewrite SSE):
   - Select existing target sheet OR create a new blank black sheet (cols×rows, tile size, border).
   - Upload/drop a source image with sprites on black that do NOT match the grid (reuse loadDroppedFiles / drop helpers; source vs target must be clear in UX).
   - User clicks once on each sprite; flood-fill / connected-component isolation on near-black threshold (reuse blackKey-style cutoff); crop the component.
   - Place into the target composed sheet at the next free N×M grid region snapped to the grid (ceil pixel size to tiles); mark occupancy; auto-grow target by whole rows if needed.
   - Download extended sheet image + JSON metadata the editor already uses.

3) AGENT API: window API (e.g. window.__SSE__ / sseExtendApi) calling the SAME internal functions as the UI (createBlankSheet, selectTargetSheet, loadSourceImage, isolateAt, downloadExtendedSheet, getState, events). Works on /sse without the game. Document exact names in the skill and docs/changes.

4) SKILL: create skills/extend-sprite-sheet/SKILL.md describing the aligned user+AI flow (prefer production /sse), API usage, and that LLM JSON tagging happens AFTER download (out of SSE scope). Decorative map assets should use this path.

5) TESTS: unit tests for isolation + packing helpers; e2e for /sse light route and import/isolate flow (synthetic black-bg source with 2 blobs; API or click). Keep existing SSE drop tests green.

6) OUT OF SCOPE: merging #688/#750, generating art, LLM tagging implementation.

Finally summarise: files changed, how /sse avoids full boot, API surface, and caveats. Include a conventional commit message title + bullets for the operator.

CONTEXT:
# Context for SSE light route + extend-sheet workflow

## Repo
- theSystem85/code-for-battle, base: main (currently 0.53.1 at 7bd010a5; open drafts #688 and #750 both claim 0.54.0 — bump THIS work to 0.55.0).
- Production site: https://code-for-battle.netlify.app
- After this ships, preferred agent/user entry: https://code-for-battle.netlify.app/sse

## Existing SSE (build on it, do not rewrite)
- UI modal: `#spriteSheetEditorModal` / `#sseRoot` in `index.html`
- Logic: `src/ui/spriteSheetEditor.js` (~2123 lines). Key exports: `initSpriteSheetEditor`, `loadDroppedFiles`, `isDroppedImageFile`, `isDroppedJsonFile`, `DEFAULT_SSE_TAGS`.
- Opened today only after full game boot via Map Settings → `#openSpriteSheetEditorBtn` (`src/ui/mapEditorControls.js` calls `initSpriteSheetEditor`).
- File drop onto `#sseCanvasWrap` already loads images (incl. empty MIME by extension) and JSON tags (#648 / `tests/e2e/spriteSheetEditorDrop.test.js`, `tests/unit/spriteSheetEditorDrop.test.js`). Reuse that path for uploading the ungridded source sheet.
- Sheet list from `images/map/sprite_sheets/index.json` and animations index. Metadata uses tile grid (`tileSize`, optional `rowHeight`, `borderWidth`), tags per tile, IndexedDB keys `rts-sse-metadata:*`.
- `blackKey` / `cutoffBrightness` / `softenBrightness` already exist for combat decals — reuse similar near-black threshold for isolation.
- Download today: JSON only via `triggerJsonDownload`. Need image (+ JSON/meta) download for the *composed/extended* target sheet.
- Default game `TILE_SIZE` is 32 in `src/config.js`; SSE default tile is 64 (`DEFAULT_TILE_SIZE`). Target composed sheets should respect the active SSE tile size / row height / border width of the target sheet.

## Boot / routing today
- Single SPA entry `index.html` → `src/main.js` which boots the full game (storage, renderer, assets, map…).
- Netlify SPA fallback: `/*` → `/index.html` (force=false). Legal pages use separate HTML entries + vite rewrites — a good pattern to copy for a light SSE page.
- Vite: `vite.config.js` has multi-page legal routes and landing rewrites.

## Required product behavior
### 1. Light `/sse` route
- Visiting `/sse` (dev, preview, production) must open ONLY the Sprite Sheet Editor.
- Must NOT run the full game boot / loading screen / unit image pipeline / map generation / WebGPU asset preload.
- Prefer a dedicated lightweight entry (e.g. `sse.html` + small `src/sseApp.js` or similar) that:
  - mounts the existing SSE DOM (can share markup with the modal body, or duplicate the SSE root markup into the light page),
  - loads minimal CSS,
  - calls `initSpriteSheetEditor` (or a new `initStandaloneSpriteSheetEditor`) with options that auto-open and skip game callbacks,
  - does not import gameOrchestrator / textureManager / unit maps.
- Wire Netlify redirect and Vite rewrite/dev middleware so `/sse` serves that page (not the game). Keep SPA fallback for other paths.
- Also accept a hash/query fallback only if needed for local static hosts, but `/sse` path is the contract.
- E2E: Playwright navigates to `/sse`, asserts SSE UI visible, asserts game canvas / loading screen are NOT part of the boot (no `#gameCanvas` required, no wait for loading-screen--hidden). Prefer not loading heavy `/images/map/units/**` prepared sprites.

### 2. Extend-sheet workflow (UI)
Add an "Extend sheet" (or "Compose / Import sprites") mode/panel in SSE:

1. **Target sheet**: select an existing sheet from the dropdown OR create a new blank black sheet (configurable columns×rows, tile size, border; fill pure black; add to sheet list as a transient/local sheet like dropped images).
2. **Source upload**: upload/drop an image with isolated sprites on a black (or near-black) background that does NOT match the grid. Reuse drop helpers; keep source image available alongside the target (e.g. dual canvas, or a source pane that can be toggled). Clear UX: user is looking at the SOURCE when clicking to isolate, and results land on the TARGET.
3. **Click-to-isolate**: one click on a sprite in the source runs a flood-fill / connected-component on non-black pixels under the click (threshold based on brightness, default similar to blackKey cutoff ~8–24; make threshold configurable in UI). Extract bounding box of the component; crop with alpha (black → transparent or keep black as transparent key). Reject empty/too-small clicks with a status message.
4. **Pack into target**: place the isolated sprite into the next free axis-aligned grid region of size N×M tiles that fits the sprite's pixel bounds (ceil(width/tileW) × ceil(height/tileH)), scanning row-major for free slots. Sprite must snap to the grid pattern (may span multiple tiles). Mark occupied tiles so later packs do not overlap. If no free region fits, grow the target sheet downward by whole rows (or report clearly and offer grow) — prefer auto-grow by rows to keep the workflow unblocked.
5. **Download**: button downloads the extended target sheet image (WebP preferred at quality consistent with repo; PNG ok for lossless editor export if WebP encode is awkward in-browser — document choice) AND the accompanying JSON metadata the editor already uses (tile grid + any occupancy/import records you add). Filename should reflect the target sheet name.

Do not require mouse for agents (see API). Keep existing static/animated tagging workflows intact.

### 3. Agent API (same events as UI)
Expose a stable programmatic API on `window` (e.g. `window.__SSE__` or `window.sseExtendApi`) that drives the SAME internal functions/events the UI uses (do not fork logic). Suggested surface (adjust names to fit code style, document final names in skill + docs/changes + specs):

- `getState()` → summary: mode, targetSheetPath, sourceLoaded, tileSize, borderWidth, occupiedTiles, pendingSprites count, status
- `createBlankSheet({ columns, rows, tileSize, borderWidth, name })`
- `selectTargetSheet(pathOrId)`
- `loadSourceImage(file|blob|ArrayBuffer|dataURL)` — same as drop image into source
- `isolateAt({ x, y })` or `isolateAtImagePixel({ x, y })` — click-equivalent; returns { ok, bbox, tileSpan, placedAt } or error
- `isolateAllAuto()` optional helper: find all connected components above area threshold and pack each (nice-to-have if cheap; not required if click/API per-sprite is solid)
- `downloadExtendedSheet()` → triggers same download as UI; preferably also returns blobs/urls for headless agents
- `on(event, handler)` / CustomEvent on `window` or sse root for: `sse:source-loaded`, `sse:isolated`, `sse:packed`, `sse:sheet-grown`, `sse:downloaded`, `sse:error` — mirror UI status transitions

API must work on the light `/sse` page without the game running.

### 4. Skill
Create `skills/extend-sprite-sheet/SKILL.md` (English), following the tone/structure of `skills/new-unit/SKILL.md`:
- When to use: creating or extending decorative/map sprite sheets from AI-generated ungridded black-background sheets (universal + biome decorative assets, etc.).
- Aligned user + AI flow: open production `https://code-for-battle.netlify.app/sse` (preferred) or local `npm run dev` → `/sse`.
- Steps: create/select target → upload source → isolate each sprite (UI click or API) → download → THEN separate LLM JSON tagging of the downloaded sheet (out of scope for SSE; say so).
- Document the Agent API methods/events exactly.
- Note: do not reinvent packing outside SSE; agents must use this path so user and AI stay aligned.

### 5. Tests / docs
- Unit tests: isolation flood-fill (synthetic ImageData with black bg + two blobs), packing finder (occupied grid, N×M fit, grow), threshold edge cases.
- E2E: `/sse` light route loads editor without game canvas boot; create blank target; load synthetic source (canvas-made PNG with 2 colored rects on black); API or click isolate both; assert status / occupied tiles / download triggers (can stub download). Reuse DataTransfer patterns from `spriteSheetEditorDrop.test.js` where useful.
- `docs/changes/2026-10-15-sse-extend-sheet.md`, new `specs/2026-10-15-sse-extend-sheet.md`, English `prompt-history/` entry naming Codex model if known.
- `features/0.55.0.json` with a short user-facing feature line; bump package.json + lockfile root version; run/generate version script if present (`node scripts/generate-version.js`).
- No HTML `title` attributes. English only. Conventional commit message in the final summary for the operator (operator commits — you do not commit).
- No merge. Do not touch Codex MCP settings. Do not add secrets.

## Implementation hints (non-binding)
- Extract pure helpers to e.g. `src/ui/sseIsolate.js` and `src/ui/ssePack.js` (or under `src/utils/`) so unit tests do not need DOM.
- Isolation: BFS/flood on ImageData; treat pixel as background if max(r,g,b) <= cutoff (or luminance <= cutoff); collect bounds; optional padding 1px; output ImageData/canvas cropped.
- Packing: 2D free-rect scan on boolean occupancy[col][row]; size = ceil(spriteW / (tileSize+border?)) carefully matching how SSE already computes tile cells in `getTileAtCanvasPos` / `drawSseCanvas`.
- Standalone page: keep CSS shared; avoid importing `src/main.js`. Stub `window.logger` if needed.
- Keep modal path working from the full game for existing users; light route is additive.

## Out of scope
- LLM JSON tagging of downloaded sheets (skill only mentions it as a later step).
- Generating decorative art itself.
- Merging PR #688 / #750.

## Repository instructions supplied with the prompt

The user also supplied the repository AGENTS.md rules and environment context. The authoritative rules are retained in `AGENTS.md`; they cover required unit/lint commands, per-prompt change notes and English history, separate feature specs, conventional commit suggestions, image assets as WebP 0.85, release JSON/version generation, occupancy and rendering/performance requirements, no merge commits, and no weakening lint. Workspace: `/home/codex/work/20261015-181843-069a21`; shell bash; user date 2026-10-15; timezone Europe/Berlin. No commit/push/remotes changes are authorized in this task.
