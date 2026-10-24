- [x] **Improvement: Default game settings**
  Start with 15 m coastal shallows, four mixed biome regions weighted 25% each, all shores and the center lake enabled, 10% water and rocks, four city centers (radius 8), three ruin centers (radius 7), and music after the first gesture on every visit unless explicitly disabled. Portrait mobile already starts with the condensed bottom sidebar. Saved settings remain respected.
  Spec: none

- [x] **Bugfix: Preserve large rock decoration placement**
  Include rock props spanning three or more tiles in the existing seed-dependent large-prop preparation pass, so smaller props do not crowd out sand boulders with the new denser rock terrain. This runs during map preparation, once per catalog group, with no per-frame work.
  Spec: none

Validation:
- Ran `npm run test:unit` (5,445 cases) and `npm run test` (5,531 cases). Initial failures were four sandbox-blocked Git subprocess tests, a topology test that used the new default city count as its changed value, and sand boulder catalog coverage under the denser terrain.
- All five release-script tests passed with subprocess permissions. Topology regression checks passed after selecting values distinct from defaults. All 25 catalog coverage and decoration placement cases passed after fixing boulder placement; no catalog assertions removed.
- Final focused verification: 34 unit cases passed across city lifecycle, topology, music and decoration layout; 25 catalog and placement cases passed; mixed-biome browser flow passed. Portrait HUD browser test passed after waiting for the loading screen to close before measuring final layout. Final lint passed.
- Full Playwright suite skipped in this environment: it includes GPU/performance benchmarks, and no hardware GPU was verified. Functional Chromium coverage targets mixed biome controls and portrait mobile layout. Hardware GPU / 75 FPS acceptance remains pending on qualifying hardware; no GPU benchmarks run in this environment.
