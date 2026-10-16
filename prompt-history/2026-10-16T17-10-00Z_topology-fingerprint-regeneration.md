UTC timestamp: 2026-10-16T17:10:00Z
Harness: Codex. Exact model version, reasoning level and token usage are unavailable in this session and are omitted.

## User prompt

You are working in a git repository checked out at the current directory (branch codex/pr-688-regenerate-the-map-when-c-20261016-190931-91dc10, based on cursor/biome-decorative-tiles-745b).
Follow the repository's own instructions (AGENTS.md etc.) for code style, docs and tests, but do not commit, push, or change git remotes; the operator commits for you.
Stay inside this directory. Network access is disabled in the sandbox. Do not add secrets or credentials.
TASK:
PR #688: regenerate the map when custom sheet selection or tags change (code-for-battle). Sheet availability and tags now drive map topology (impassable decorations, ruin/city/trees/rocks/farm clusters, landmarks, shore props, destructible city buildings with occupancy, ground detail). Key files: src/rendering/textureManager.js (setIntegratedSpriteSheetConfig, decoration layout cache), src/rendering/decorationLayout.js, src/game/cityBuildings.js, src/ui/mapEditorControls.js (sheet selection, integrated mode), src/ui/spriteSheetEditor.js (tag edits/apply metadata), src/saveGame.js, src/network/stateSync.js and multiplayer lobby/map-settings sync (rg "mapSeed|oreFields|citySeeds" src/network src/ui), map generation/occupancy (rg "occupancyMap|generateMap").
Implement:
1) Topology fingerprint: pure function computing a stable hash (e.g. FNV-1a over a canonical JSON) of the active custom sheet paths (sorted) + each sheet's tile tags (sorted keys) + decoration settings (citySeeds, cityClusterSize, ruinSeeds, ruinClusterSize). Empty selection / custom mode off -> a constant 'default' fingerprint (empty-custom parity must still hold).
2) Store the fingerprint with the map state (gameState.mapTopologyFingerprint) and in saves.
3) When the fingerprint changes (sheet selection change in map settings, integrated mode toggle, tag changes applied in the Sprite Sheet Editor, or on leaving the SSE back to the game), fully regenerate the map deterministically from the same seed: logic (decoration layout, impassable occupancy, city buildings HP/footprints, path caches) and render caches (invalidate prepared layout/canvases). Only before match start or in single-player sessions; if a single-player match is already running, regenerate via the same path used when map settings change today (follow existing behaviour; if the game restarts the map on seed change, do the same). Never mid-match in multiplayer.
4) Multiplayer: host is authoritative; host includes the fingerprint + sheet selection + decoration settings in the map settings sync; clients use the host's values (and the host's sheet selection) and regenerate before match start; mid-match changes on clients are ignored/blocked with a notification.
5) Saved games: keep the saved topology (do not regenerate on load); if the current fingerprint differs from the save's, show a non-blocking notification that the save uses a different sheet/tag configuration. Document the choice.
Tests: unit tests for fingerprint stability/sensitivity (tag change, selection order independence), regeneration trigger (impassable set changes after a tag change from impassable to passable on an optional sheet), multiplayer serialization, save behaviour. e2e (tests/e2e/topologyFingerprint.test.js): enable an optional sheet, record occupancy/impassable count, change a tag via the SSE API path or editor metadata apply (impassable -> passable on a sheet used by decorations), return to game, assert fingerprint changed and impassable set changed; keep emptyCustomSheets parity test green.
Docs: docs/changes/2026-10-16-topology-fingerprint-regeneration.md, prompt-history/2026-10-16T17-10-00Z_topology-fingerprint-regeneration.md, skills/map-assets/SKILL.md, features/0.56.0.json. English, no title attributes, no top-level await. Run lint + unit tests.

## Outcome

Implementation completed with fingerprint, reset integration, host serialization, saved metadata preservation, unit/E2E coverage and documentation. Final unit run: 282 files and 5,071 tests passed. Lint and changed-file auto-fix passed. E2E execution was blocked by sandbox listener permissions. Work ended at 2026-10-16T17:19:23Z; an exact task duration is unavailable. No commit, push or remote changes were made.
