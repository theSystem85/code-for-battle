# AI harvester streets

Enemy AI counts actual harvester entries into off-road land tiles. After three passes, it can extend an adjacent street onto that tile, spending the normal street cost from its construction yard budget. It places at most one tile per simulation second. Ore, crystals, buildings, reserved terrain and decorations are preserved. The behavior is independent of visual track settings and applies to classic and LLM-controlled enemies.

Traffic evidence expires after three minutes and is bounded to 1,024 tiles per construction yard. It is transient and relearned after loading. Position checks use unit centers. Existing placement mutation notifications and replay commands are used.

CPU work: O(harvesters) at the existing approximately 20 Hz AI cadence; a maximum 1,024 candidate checks once per second per AI. No rendering or DPR-dependent work. Hardware 75 FPS acceptance remains pending on qualifying hardware.


Browser setup: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` launches the installed browser when the Playwright CDN is forbidden. The existing harvester stuck-rescan browser test fails in its setup because `gameState.targetedOreTiles` is undefined. A diagnostic correction to its singleton initialization and simulation clock reached a later timeout; those experimental test edits were reverted. Full browser-suite and qualifying-hardware performance acceptance remain outstanding.

Validation on latest dev: `npm run lint` passes. `npm run test:unit -- --maxWorkers=4` completed with 5,849 passing and three failures; `npm run test -- --maxWorkers=4` completed with 5,934 passing and four failures. The decoration-coverage and updateGame timeout failures pass on an isolated single-worker retry. The remaining mapSourceSheets woodland alpha mismatch reproduces on unchanged `origin/dev` (7f704368). Enemy AI and street tests pass. The full E2E suite was skipped; the affected harvester test was attempted using system Chromium and has the separate failure documented above.
