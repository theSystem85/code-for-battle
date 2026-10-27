- [x] **Improvement: Increase supply ship radius**
  Increased the supply ship service radius by 33%, from 2 to 2.66 tiles, including default values used by spawning, servicing, AI, guarding, and the range indicator.
  Spec: none

Distance checks use continuous world coordinates so the additional 0.66 tiles take effect without whole-tile rounding. The existing service-area shape and per-unit radius overrides are preserved.

Performance: servicing runs per simulation tick over supplier/target pairs, AI range checks run per active naval unit, and range drawing runs per selected unit per frame. No extra loops, scans, draw calls, or allocations are introduced at any entity count or DPR; servicing removes two temporary coordinate objects per pair. Hardware GPU performance acceptance remains pending.

Validation: `npm run lint:fix:changed` and `npm run lint` pass. The full unit run reports 5,678 passing tests and four release-script subprocess permission failures; all five tests in that file pass when rerun with execution permissions. All 86 integration tests pass. A focused check in system Chromium confirms servicing at 2.65 tiles and no servicing at 2.67 tiles for configured and fallback radii. The existing Playwright service-ownership scenario E00106 fails during setup with "Failed to spawn all required units"; the full E2E suite, including GPU performance tests, was not run.
