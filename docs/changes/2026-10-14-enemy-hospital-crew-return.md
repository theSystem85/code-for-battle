# Bug: Enemy hospital crew return

- [x] **Preserve medical routes until crew restoration**
  Prioritize medical routing, use tile destinations and center-based path origins, retry unreachable routes and release medical state after healing.
  Spec: [Hospital & Crew System](../../specs/003-hospital-crew-system/spec.md)

Main diagnosis: real bugs exist. Hospital routing assigned pixel destinations to a tile-based movement API; strategic decisions could override medical paths; completion required a move target that movement clears on arrival. Retain the supplied patch's corrections, including clearing combat targets during medical return. Unit tests cover route coordinates, retries, strategic priority and completion. A coupled real movement/pathfinding/AI/hospital check restores the missing gunner with these fixes and fails on main.

Regression: `tests/e2e/enemyHospitalCrewRegression.test.js`. Require an AI-assigned hospital route with a valid tile destination, physical travel of more than two tiles, entry into the hospital's actual healing queue, then eleven simulation seconds for its ten-second per-crew treatment. Require restored crew and released medical flags. The previous browser healing timeout was not reproduced in the coupled check; the corrected test distinguishes service arrival from healing duration and reports crew, path, destination, treatment progress, hospital footprint/radius/health, fuel, pause state and simulation time.

- [x] Chromium validation: `npm run test:e2e:regressions` passes (see `2026-10-14-four-regressions-chromium-validation.md`).
- [ ] Qualifying-hardware before/after 75 FPS acceptance under `performance_improvement.md`; no browser/hardware benchmark is available. No rendering changes or performance certification.

Hot-path audit and exact acceptance protocol are recorded in the hospital spec. Round 2 validation is recorded in `2026-10-14-vitest-playwright-runner-separation.md`.
