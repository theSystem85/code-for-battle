# Topology fingerprint regeneration

Canonicalize active sheet paths, sheet/tile tags and normalized city/ruin settings; hash with FNV-1a. Disabled custom mode and explicit empty selections both use `default`. Hash only during configuration/preparation, never in update/render loops.

Sheet selection, integrated mode, applied tags and returning from SSE use the existing map-settings reset with the unchanged seed. Rebuild layouts, city health/footprints, occupancy and path caches; invalidate prepared render caches. Unapplied SSE edits are collected until apply/close. Multiplayer hosts control settings before start; clients use host selection, metadata and fingerprint. No multiplayer topology changes during a match.

Saves store the fingerprint and selected sheet metadata. Loading restores the saved map and metadata instead of regenerating from current tags. Notify without blocking when the previous configuration fingerprint differs. Legacy saves without a fingerprint retain the existing restoration path with a default fingerprint.

Validation: `npm run test:unit`, `npm run lint:fix:changed`, `npm run lint`, `npm run test:e2e -- tests/e2e/topologyFingerprint.test.js tests/e2e/emptyCustomSheets.test.js --project=chromium --reporter=line`.

Browser acceptance is outstanding: this sandbox rejects the Vite listener with `listen EPERM 127.0.0.1:5173`. No simulation/render hot loops were added; qualifying hardware performance certification was not available here.

Final sandbox results (2026-10-16): `npm run test:unit` passed 282 files and 5,071 tests (71.11 s). `npm run lint:fix:changed`, `npm run lint` and `git diff --check` passed. The requested E2E command stopped before test execution because its web server could not listen; direct `npm run dev -- --host 127.0.0.1` confirmed `listen EPERM: operation not permitted 127.0.0.1:5173`.

Startup configuration must finish before initial world generation. Record the first fingerprint without regeneration, retain the saved selected sheets instead of applying the editor's initial sheet, and filter unknown paths before sorted metadata loading. Subsequent Apply/Close operations retain topology regeneration.

Startup browser command: `npm run test:e2e -- tests/e2e/integratedStartupSheets.test.js tests/e2e/topologyFingerprint.test.js tests/e2e/emptyCustomSheets.test.js --project=chromium --workers=1 --reporter=line`. Execution remains blocked by `listen EPERM 127.0.0.1:5173` in this sandbox.

Startup fix validation: all 282 unit files / 5,075 tests passed (68.26 s); `npm run lint:fix:changed`, `npm run lint`, and `git diff --check` passed. All three requested E2E files were invoked together but could not execute because the Vite server was denied its localhost listener (EPERM).
