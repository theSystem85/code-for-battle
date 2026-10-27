# Bug

- [x] **Check movable occupancy once per new order**
  Ground, naval, and amphibious move/attack commands avoid movable occupants during initial planning; automatic movement, pursuit, and recovery paths ignore movable occupancy while preserving fixed blockers and mine rules.
  Spec: none

Ship positions are snapshotted once per command, using unit centers, because ships are excluded from the land occupancy grid. The snapshot is shared across selected units and never stored on units or in the automatic path cache. Self-occupancy does not block departure.

The tanker's separate initial attack approach also opts in, including its fallback; periodic tanker pursuit keeps the default behavior.

Verification: 144 focused unit tests passed. Chromium functional tests E00240 (initial move/attack paths, automatic recovery, and fresh orders for tanks, tankers, destroyers, and hovercraft) and E00234 (naval movement and settling) passed using the installed `/usr/bin/chromium`. Full E2E coverage was limited to these affected movement tests; the full suite includes unrelated and hardware-dependent scenarios.

Full checks: `npm run lint` passed. `npm run test:unit` passed 5,680 tests and `npm run test` passed 5,766 tests; both initially reported the same four release-script failures because the sandbox denied `spawnSync git`. Rerunning `tests/unit/releaseScript.test.js` with the required execution permission passed all five tests in that file, verifying all 5,770 unit/integration cases across the runs.

Performance: command planning scans the unit list once per order (O(units)), independently of DPR. Automatic path requests add a constant-time disabled flag check per occupancy query; no new per-tick entity scans or snapshots are introduced. Hardware 75 FPS acceptance remains pending on Patrick's GPU; this environment has no verified hardware GPU.
