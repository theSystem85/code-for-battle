# Round 2 regression corrections

UTC: 2026-10-14T20:01:13.870020+00:00
Harness: Codex (API coding agent).
Model: GPT-6. The exact serving variant, model revision and reasoning level are not exposed in this session. Input, visible-output and reasoning token counts and exact total task duration are unavailable and omitted.

## Prompt

You are working in a git repository checked out at the current directory (branch codex/round-2-apply-the-given-patch-th-20261014-213027-3879f0, based on main).
Follow the repository's own instructions (AGENTS.md etc.) for code style, docs and tests, but do not commit, push, or change git remotes; the operator commits for you.
Stay inside this directory. Network access is disabled in the sandbox. Do not add secrets or credentials.
TASK:
Round 2: apply the given patch, then correct the 4 Playwright E2E regression tests and fix real bugs per the context file

CONTEXT:
Repo: code-for-battle (vanilla JS RTS, Vite). Follow AGENTS.md strictly (English, lint clean, docs/changes note per issue, English prompt-history entry).
You have NO network and cannot run Playwright/browsers. Write Playwright E2E tests anyway; a human will run them and send failures back.

Handle FOUR issues. For EACH: (a) write a new permanent Playwright E2E test in tests/e2e/ following existing patterns (see tests/e2e/apacheAutoReturnHelipad.test.js, enemyAirTargetEligibility.test.js: goto '/?seed=N', wait for window.gameState/gameInstance/cheatSystem, skip tutorial, spawn units/buildings via cheat system or direct gameState manipulation, then assert behaviour with page.waitForFunction / expect.poll against game state). Tests must be deterministic and fail on the buggy behaviour. (b) Investigate the source code and fix the bug if present.

Issue 2: Defense turrets and tanks fire through buildings (TODO/Bugs.md "Defense turrets should not fire through buildings" and related). Shots must need line of sight, or buildings must block projectiles. Test: place turret/tank, a building between it and an enemy target; assert no firing / no damage through the building (target health unchanged), and that it does fire with a clear line.
Issue 3: Rocket tank rockets don't detonate on airborne targets and fire at the move destination (Bugs "Rocket tank rockets should detonate on airborne targets and stop firing at move destinations"). Test: rocket tank vs airborne Apache -> Apache takes damage; rocket tank given a move order with no target -> fires no rockets.
Issue 4: Multiple Apaches land on the same helipad when ordered one at a time; hovering an occupied helipad should show a blocked cursor (Bugs "Prevent multiple Apaches from landing on the same helipad", Improvements L74). Test: two Apaches, each individually ordered to the same helipad -> second must not land on the occupied pad (redirect to another free pad or stay airborne); cursor over occupied pad shows blocked state.
Issue 5: Enemy AI should send tanks missing crew members back to the hospital before continuing battle (Bugs item 7, spec specs/003-hospital-crew-system/spec.md). Test: enemy tank with missing crew and an enemy hospital -> AI moves it toward the hospital / it gets restored.

Also: add npm script "test:e2e:regressions" running exactly these 4 new files with --project=chromium. Do NOT change vitest config exclusion of tests/e2e. Do NOT edit TODO checkbox lines except ticking items you actually fixed. Put the four docs/changes notes as separate files. Summarize at the end per issue: whether you believe the bug existed in code, what you changed, the test file name.


=== ROUND 2 ===
FIRST apply this previous-round patch exactly (git apply), it is your starting point:

The supplied patch is preserved below as the applied diffs; reconstructed file contents were checked against the supplied Git blob hashes before Round 2 edits.

```diff
diff --git a/docs/changes/2026-10-14-apache-helipad-occupancy-regressions.md b/docs/changes/2026-10-14-apache-helipad-occupancy-regressions.md
new file mode 100644
index 00000000..e732f6b7
--- /dev/null
+++ b/docs/changes/2026-10-14-apache-helipad-occupancy-regressions.md
@@ -0,0 +1,13 @@
+# Bug: Apache helipad occupancy
+
+- [x] **Apache helipad occupancy**
+  Existing individual landing reservations and blocked cursor retained; permanent two-pad regression added.
+  Spec: none
+
+Regression: `tests/e2e/apacheHelipadOccupancyRegression.test.js`.
+
+- [ ] Browser validation: `npm run test:e2e:regressions` (browser execution prohibited in this sandbox).
+
+Validation: `npm run lint:fix:changed` and `npm run lint` passed with the installed repository dependencies. Unit and integration results are recorded in the test runner separation change note.
+
+Supplemental verification: `git diff --check` passed.
diff --git a/docs/changes/2026-10-14-building-line-of-sight-regressions.md b/docs/changes/2026-10-14-building-line-of-sight-regressions.md
new file mode 100644
index 00000000..7962335a
--- /dev/null
+++ b/docs/changes/2026-10-14-building-line-of-sight-regressions.md
@@ -0,0 +1,13 @@
+# Bug: Building line of sight
+
+- [x] **Building line of sight**
+  Existing gun-turret and tank obstruction checks retained; permanent blocked-shot and clear-shot regression added.
+  Spec: none
+
+Regression: `tests/e2e/buildingLineOfSightRegression.test.js`.
+
+- [ ] Browser validation: `npm run test:e2e:regressions` (browser execution prohibited in this sandbox).
+
+Validation: `npm run lint:fix:changed` and `npm run lint` passed with the installed repository dependencies. Unit and integration results are recorded in the test runner separation change note.
+
+Supplemental verification: `git diff --check` passed.
diff --git a/docs/changes/2026-10-14-enemy-hospital-crew-return.md b/docs/changes/2026-10-14-enemy-hospital-crew-return.md
new file mode 100644
index 00000000..3b8a5200
--- /dev/null
+++ b/docs/changes/2026-10-14-enemy-hospital-crew-return.md
@@ -0,0 +1,15 @@
+# Bug: Enemy hospital crew return
+
+- [x] **Enemy hospital crew return**
+  Prioritize medical routes before strategic decisions, use tile destinations and center-based origins, retry failed routes, and release medical state after crew restoration.
+  Spec: [Hospital & Crew System](../../specs/003-hospital-crew-system/spec.md)
+
+Regression: `tests/e2e/enemyHospitalCrewRegression.test.js`.
+
+- [ ] Browser validation: `npm run test:e2e:regressions` (browser execution prohibited in this sandbox).
+
+Validation: `npm run lint:fix:changed` and `npm run lint` passed with the installed repository dependencies. Unit and integration results are recorded in the test runner separation change note.
+
+- [ ] Qualifying-hardware 75 FPS validation remains outstanding; no browser or live benchmark was available. No rendering changes.
+
+Supplemental verification: `git diff --check` passed. Medical returns clear combat targets to prevent combat steering from overwriting their paths.
diff --git a/docs/changes/2026-10-14-rocket-tank-air-move-regressions.md b/docs/changes/2026-10-14-rocket-tank-air-move-regressions.md
new file mode 100644
index 00000000..ad3c6b72
--- /dev/null
+++ b/docs/changes/2026-10-14-rocket-tank-air-move-regressions.md
@@ -0,0 +1,13 @@
+# Bug: Rocket tank air and move orders
+
+- [x] **Rocket tank air and move orders**
+  Existing airborne rocket detonation/damage and target clearing retained; permanent air-hit and move-order regression added.
+  Spec: none
+
+Regression: `tests/e2e/rocketTankAirAndMoveRegression.test.js`.
+
+- [ ] Browser validation: `npm run test:e2e:regressions` (browser execution prohibited in this sandbox).
+
+Validation: `npm run lint:fix:changed` and `npm run lint` passed with the installed repository dependencies. Unit and integration results are recorded in the test runner separation change note.
+
+Supplemental verification: `git diff --check` passed.
diff --git a/docs/changes/2026-10-14-vitest-playwright-runner-separation.md b/docs/changes/2026-10-14-vitest-playwright-runner-separation.md
new file mode 100644
index 00000000..4c527e8d
--- /dev/null
+++ b/docs/changes/2026-10-14-vitest-playwright-runner-separation.md
@@ -0,0 +1,16 @@
+# Bug: Test runner separation
+
+- [x] **Use the intended test runner**
+  Scope `npm test` to all unit and integration suites so Playwright suites run through their dedicated scripts, preserving Vitest configuration and all browser tests.
+  Spec: none
+
+Validation:
+
+- `npm run test:unit`: 255 files, 4,860 tests passed.
+- `npm test`: 257 files, 4,946 tests passed; no Playwright suites collected.
+- `npm run lint:fix:changed`: passed.
+- `npm run lint`: passed.
+- `git diff --check`: passed.
+- Browser tests intentionally not run, per the request; the human operator must run `npm run test:e2e:regressions`.
+
+`vitest.config.js`, TODO checkboxes, and CI lint rules remain unchanged. No tests were disabled; Playwright tests retain their dedicated runner.
diff --git a/package.json b/package.json
index c4545545..1202933d 100644
--- a/package.json
+++ b/package.json
@@ -19,7 +19,7 @@
     "make:sprites": "node makeSprites.js",
     "make:prepared-sprites": "node scripts/build-prepared-sprites.mjs",
     "count:locs": "node countLocs.js",
-    "test": "vitest run",
+    "test": "vitest run tests/unit/ tests/integration/",
     "test:unit": "vitest run tests/unit/",
     "test:integration": "vitest run tests/integration/",
     "test:smoke": "vitest run tests/integration/browserConsoleSmoke.test.js",
@@ -27,6 +27,7 @@
     "test:coverage": "vitest run --coverage",
     "test:ui": "vitest --ui",
     "test:e2e": "playwright test",
+    "test:e2e:regressions": "playwright test tests/e2e/buildingLineOfSightRegression.test.js tests/e2e/rocketTankAirAndMoveRegression.test.js tests/e2e/apacheHelipadOccupancyRegression.test.js tests/e2e/enemyHospitalCrewRegression.test.js --project=chromium",
     "test:e2e:netlify": "PLAYWRIGHT_NETLIFY_DEV=1 playwright test",
     "test:e2e:multiplayer": "node scripts/runPlaywrightMultiplayer.js",
     "test:e2e:multiplayer:full": "PLAYWRIGHT_MULTIPLAYER_GREP='extended full assault.*blue structures' node scripts/runPlaywrightMultiplayer.js",
diff --git a/specs/003-hospital-crew-system/spec.md b/specs/003-hospital-crew-system/spec.md
index d6b3dc26..3e9c3539 100644
--- a/specs/003-hospital-crew-system/spec.md
+++ b/specs/003-hospital-crew-system/spec.md
@@ -328,3 +328,12 @@ As a player, I want enemy AI units to have the same crew system and for AI to ma
 - **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
 - **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
 - **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]
+
+## Hospital return regression coverage (2026-10-14)
+
+AI medical return routing precedes strategic retreat/attack decisions. Destinations use tiles, path origins use unit centers, unreachable routes remain retryable, and restored crew clear hospital return state even after movement clears the destination on arrival.
+
+- Permanent browser coverage: `npm run test:e2e:regressions` includes `tests/e2e/enemyHospitalCrewRegression.test.js`, observing actual AI travel, automatic healing, and return-state release.
+- Focused unit coverage: `tests/unit/aiHospitalReturn.test.js` and hospital-return cases in `tests/unit/enemyUnitBehavior.test.js`.
+- Validation: `npm run lint:fix:changed` and `npm run lint` passed with installed dependencies. Unit/integration results are recorded in `docs/changes/2026-10-14-vitest-playwright-runner-separation.md`. Browser execution was prohibited.
+- Performance check remains outstanding: run the acceptance protocol in `performance_improvement.md` on qualifying hardware before/after this AI priority change. Record cold first traversal, repeated full-map scrolling, selected layered units, firing, movement, water, realistic entity counts, FPS, p95/p99/max frame times, missed 13.333 ms deadlines, CPU update/render, backend/DPR, GPU timing if available, and memory/GC. No 75 FPS certification is claimed. At 75 update calls/sec and 200 units, the moved medical check is evaluated up to 15,000 times/sec; it introduces no new per-unit allocations or rendering/DPR-dependent work.
diff --git a/src/ai/crewHealing.js b/src/ai/crewHealing.js
index 6b21c79a..05e90a12 100644
--- a/src/ai/crewHealing.js
+++ b/src/ai/crewHealing.js
@@ -216,14 +216,18 @@ function sendUnitToHospital(unit, hospital, mapGrid, now) {
     { x: hospitalCenterX + 1, y: refillY + 1 }
   ]
 
+  // Only retain the return state when a reachable service position exists.
+  unit.returningToHospital = false
+
   // Find best position
-  const startNode = { x: unit.tileX, y: unit.tileY, owner: unit.owner }
+  const startNode = { x: Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE), y: Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE), owner: unit.owner }
   for (const pos of refillPositions) {
     if (pos.x >= 0 && pos.y >= 0 && pos.x < mapGrid[0].length && pos.y < mapGrid.length) {
       const path = getCachedPath(startNode, pos, mapGrid, null, { unitOwner: unit.owner })
       if (path && path.length > 0) {
+        unit.returningToHospital = true
         unit.path = path
-        unit.moveTarget = { x: pos.x * TILE_SIZE, y: pos.y * TILE_SIZE }
+        unit.moveTarget = { x: pos.x, y: pos.y }
         break
       }
     }
diff --git a/src/ai/enemyUnitBehaviorCore.js b/src/ai/enemyUnitBehaviorCore.js
index 36fdb4e4..0c712c4f 100644
--- a/src/ai/enemyUnitBehaviorCore.js
+++ b/src/ai/enemyUnitBehaviorCore.js
@@ -52,6 +52,66 @@ export function updateAIUnitInternal(unit, units, gameState, mapGrid, now, aiPla
     return
   }
 
+  // PRIORITY: Check crew status and handle hospital returns (exclude ambulance for AI)
+  if (unit.crew && typeof unit.crew === 'object' && unit.type !== 'ambulance') {
+    let missingCrew = 0
+    for (const role in unit.crew) {
+      if (Object.prototype.hasOwnProperty.call(unit.crew, role) && !unit.crew[role]) missingCrew++
+    }
+
+    if (unit.returningToHospital && (!unit.hospitalTarget || unit.hospitalTarget.health <= 0)) {
+      unit.returningToHospital = false
+      unit.hospitalTarget = null
+    }
+
+    if (missingCrew > 0 && !unit.returningToHospital) {
+      // Unit has missing crew - prioritize hospital return
+      const canMove = unit.crew.driver && unit.crew.commander
+
+      if (!canMove) {
+        // Unit cannot move - wait for ambulance assistance
+        unit.target = null
+        unit.moveTarget = null
+        unit.path = []
+        // Allow defensive firing only
+        if (unit.isBeingAttacked && unit.lastAttacker && unit.crew.gunner) {
+          unit.target = unit.lastAttacker
+        }
+        return // Skip normal AI behavior
+      } else {
+        // Unit can move - should return to hospital immediately
+        // This will be handled by manageAICrewHealing
+        unit.needsHospital = true
+        // Stop offensive behavior - only allow defensive firing
+        unit.moveTarget = null
+        unit.path = []
+        if (unit.isBeingAttacked && unit.lastAttacker && unit.crew.gunner) {
+          unit.target = unit.lastAttacker
+        } else {
+          unit.target = null
+        }
+        return // Skip normal AI behavior until crew is restored
+      }
+    }
+
+    // Combat steering must not replace the route with a chase toward an attacker.
+    if (unit.returningToHospital) {
+      unit.target = null
+
+      // Movement clears moveTarget on arrival; completion depends on crew, not a destination.
+      if (missingCrew === 0) {
+        unit.returningToHospital = false
+        unit.hospitalTarget = null
+        unit.needsHospital = false
+        unit.moveTarget = null
+        unit.path = []
+        return // Resume strategic decisions on the next update.
+      } else {
+        return // Preserve the medical route until treatment finishes.
+      }
+    }
+  }
+
   // Skip decision making while returning to or repairing at a workshop
   if (unit.returningToWorkshop || unit.repairingAtWorkshop) {
     return
@@ -136,74 +196,6 @@ export function updateAIUnitInternal(unit, units, gameState, mapGrid, now, aiPla
   // Skip further processing if unit is retreating
   if (unit.isRetreating) return
 
-  // PRIORITY: Check crew status and handle hospital returns (exclude ambulance for AI)
-  if (unit.crew && typeof unit.crew === 'object' && unit.type !== 'ambulance') {
-    const missingCrew = Object.values(unit.crew).filter(alive => !alive).length
-
-    if (missingCrew > 0 && !unit.returningToHospital) {
-      // Unit has missing crew - prioritize hospital return
-      const canMove = unit.crew.driver && unit.crew.commander
-
-      if (!canMove) {
-        // Unit cannot move - wait for ambulance assistance
-        unit.target = null
-        unit.moveTarget = null
-        unit.path = []
-        // Allow defensive firing only
-        if (unit.isBeingAttacked && unit.lastAttacker && unit.crew.gunner) {
-          unit.target = unit.lastAttacker
-        }
-        return // Skip normal AI behavior
-      } else {
-        // Unit can move - should return to hospital immediately
-        // This will be handled by manageAICrewHealing
-        unit.needsHospital = true
-        // Stop offensive behavior - only allow defensive firing
-        unit.moveTarget = null
-        unit.path = []
-        if (unit.isBeingAttacked && unit.lastAttacker && unit.crew.gunner) {
-          unit.target = unit.lastAttacker
-        } else {
-          unit.target = null
-        }
-        return // Skip normal AI behavior until crew is restored
-      }
-    }
-
-    // If unit is returning to hospital, only allow defensive actions
-    if (unit.returningToHospital) {
-      // Allow firing back if being attacked and has gunner
-      if (unit.isBeingAttacked && unit.lastAttacker && unit.crew.gunner) {
-        unit.target = unit.lastAttacker
-      } else {
-        unit.target = null
-      }
-
-      // Check if reached hospital area for healing
-      if (unit.hospitalTarget && unit.moveTarget) {
-        const distanceToHospital = Math.hypot(
-          unit.x - unit.moveTarget.x,
-          unit.y - unit.moveTarget.y
-        )
-
-        if (distanceToHospital < TILE_SIZE * 2) {
-          // Near hospital - check if crew is restored
-          const currentMissingCrew = Object.values(unit.crew).filter(alive => !alive).length
-          if (currentMissingCrew === 0) {
-            // Crew fully restored - resume normal behavior
-            unit.returningToHospital = false
-            unit.hospitalTarget = null
-            unit.needsHospital = false
-            unit.moveTarget = null
-            unit.path = []
-          }
-        }
-      }
-
-      return // Skip normal combat AI when returning to hospital
-    }
-  }
-
   // Handle ambulance behavior
   if (unit.type === 'ambulance') {
     updateAmbulanceAI(unit, units, gameState, mapGrid, now, aiPlayerId)
diff --git a/tests/e2e/apacheHelipadOccupancyRegression.test.js b/tests/e2e/apacheHelipadOccupancyRegression.test.js
new file mode 100644
index 00000000..5915d7c7
--- /dev/null
+++ b/tests/e2e/apacheHelipadOccupancyRegression.test.js
@@ -0,0 +1,48 @@
+import { test, expect } from '@playwright/test'
+import { prepareRegressionScenario, observeSimulation } from './helpers/regressionScenario.js'
+
+test('individual Apache landing orders reserve separate pads and occupied pad cursor is blocked', async({ page }) => {
+  await prepareRegressionScenario(page, 213)
+  await page.evaluate(() => {
+    const r = window.__regression
+    r.pad = r.building('helipad', r.human, 22, 22)
+    r.alternate = r.building('helipad', r.human, 28, 22)
+    r.first = r.unit('apache', r.human, 22, 25)
+    r.second = r.unit('apache', r.human, 25, 25)
+    for (const apache of [r.first, r.second]) {
+      apache.flightState = 'airborne'
+      apache.altitude = apache.maxAltitude || 90
+      apache.manualFlightState = 'takeoff'
+      apache.autoHoldAltitude = true
+    }
+    window.unitCommandsHandler.handleApacheHelipadCommand([r.first], r.pad, window.gameState.mapGrid)
+    window.gameState.gamePaused = false
+  })
+  await expect.poll(() => page.evaluate(() => window.__regression.first.landedHelipadId), { timeout: 30000 })
+    .toBe(await page.evaluate(() => window.__regression.pad.id))
+  await page.evaluate(() => {
+    const r = window.__regression
+    window.selectedUnitsRef.splice(0, window.selectedUnitsRef.length, r.second)
+    r.second.selected = true
+  })
+  const point = await page.evaluate(() => {
+    const r = window.__regression
+    const rect = document.getElementById('gameCanvas').getBoundingClientRect()
+    return { x: rect.left + (r.pad.x + 0.5) * 32 - window.gameState.scrollOffset.x,
+      y: rect.top + (r.pad.y + 0.5) * 32 - window.gameState.scrollOffset.y }
+  })
+  await page.mouse.move(point.x, point.y)
+  await expect(page.locator('#gameCanvas')).toHaveClass(/move-blocked-mode/)
+  await page.evaluate(() => {
+    const r = window.__regression
+    window.unitCommandsHandler.handleApacheHelipadCommand([r.second], r.pad, window.gameState.mapGrid)
+  })
+  await expect.poll(() => page.evaluate(() => window.__regression.second.landedHelipadId), { timeout: 30000 })
+    .toBe(await page.evaluate(() => window.__regression.alternate.id))
+  await observeSimulation(page, 2000)
+  expect(await page.evaluate(() => {
+    const r = window.__regression
+    return r.first.landedHelipadId === r.pad.id && r.pad.landedUnitId === r.first.id &&
+      r.second.landedHelipadId === r.alternate.id && r.alternate.landedUnitId === r.second.id
+  })).toBe(true)
+})
diff --git a/tests/e2e/buildingLineOfSightRegression.test.js b/tests/e2e/buildingLineOfSightRegression.test.js
new file mode 100644
index 00000000..8ab32047
--- /dev/null
+++ b/tests/e2e/buildingLineOfSightRegression.test.js
@@ -0,0 +1,48 @@
+import { test, expect } from '@playwright/test'
+import { prepareRegressionScenario, observeSimulation } from './helpers/regressionScenario.js'
+
+test('gun turret and tank cannot damage enemies through a building, but fire along a clear line', async({ page }) => {
+  await prepareRegressionScenario(page, 211)
+  await page.evaluate(() => {
+    const r = window.__regression
+    r.turret = r.building('turretGunV1', r.human, 22, 22)
+    r.blocker = r.building('powerPlant', r.human, r.turret.x + 3, r.turret.y)
+    const centerY = r.turret.y + r.turret.height / 2 - 0.5
+    r.enemyTank = r.unit('tank_v1', r.enemy, r.blocker.x + r.blocker.width + 1, centerY)
+    r.enemyTank.crew = { driver: false, commander: false, loader: false, gunner: false }
+    r.tank = r.unit('tank-v2', r.human, r.turret.x, centerY + 1)
+    r.tank.crew.driver = false // Keep the tank from sidestepping into a clear shot.
+    r.enemyTank.health = r.enemyTank.maxHealth = 10000
+    r.tank.alertMode = true // Hold position instead of routing around the obstacle.
+    r.tank.target = r.enemyTank
+    r.tank.ammunition = 100
+    r.turret.ammo = 100
+    r.initialHealth = r.enemyTank.health
+    r.tankAmmo = r.tank.ammunition
+    r.turretAmmo = r.turret.ammo
+    r.turret.holdFire = false
+    window.gameState.gamePaused = false
+  })
+  await observeSimulation(page, 6000)
+  expect(await page.evaluate(() => {
+    const r = window.__regression
+    return [r.enemyTank.health, r.tank.ammunition, r.turret.ammo]
+  })).toEqual(await page.evaluate(() => {
+    const r = window.__regression
+    return [r.initialHealth, r.tankAmmo, r.turretAmmo]
+  }))
+  await page.evaluate(() => {
+    const r = window.__regression
+    const gs = window.gameState
+    // Remove the obstacle from both building state and the pathfinding grid.
+    gs.buildings.splice(gs.buildings.indexOf(r.blocker), 1)
+    for (const row of gs.mapGrid) {
+      for (const tile of row) if (tile.building === r.blocker || tile.building?.id === r.blocker.id) tile.building = null
+    }
+    r.tank.target = r.enemyTank
+  })
+  await expect.poll(() => page.evaluate(() => {
+    const r = window.__regression
+    return r.tank.ammunition < r.tankAmmo && r.turret.ammo < r.turretAmmo && r.enemyTank.health < r.initialHealth
+  }), { timeout: 15000 }).toBe(true)
+})
diff --git a/tests/e2e/enemyHospitalCrewRegression.test.js b/tests/e2e/enemyHospitalCrewRegression.test.js
new file mode 100644
index 00000000..2e1c3813
--- /dev/null
+++ b/tests/e2e/enemyHospitalCrewRegression.test.js
@@ -0,0 +1,32 @@
+import { test, expect } from '@playwright/test'
+import { prepareRegressionScenario } from './helpers/regressionScenario.js'
+
+test('enemy tank preserves its hospital route, restores missing crew and leaves medical return state', async({ page }) => {
+  await prepareRegressionScenario(page, 214)
+  await page.evaluate(() => {
+    const r = window.__regression
+    r.hospital = r.building('hospital', r.enemy, 24, 24)
+    r.tank = r.unit('tank_v1', r.enemy, 24, 36)
+    r.tank.crew = { driver: true, commander: true, loader: true, gunner: false }
+    r.tank.health = r.tank.maxHealth
+    r.startX = r.tank.x
+    r.startY = r.tank.y
+    r.initialDistance = Math.hypot(r.tank.x + 16 - (r.hospital.x + r.hospital.width / 2) * 32,
+      r.tank.y + 16 - (r.hospital.y + r.hospital.height / 2) * 32)
+    window.gameState.gamePaused = false
+  })
+  await expect.poll(() => page.evaluate(() => {
+    const r = window.__regression
+    return r.tank.returningToHospital && r.tank.hospitalTarget?.id === r.hospital.id &&
+      r.tank.moveTarget?.x < window.gameState.mapGrid[0].length && r.tank.moveTarget?.y < window.gameState.mapGrid.length
+  }), { timeout: 15000 }).toBe(true)
+  await expect.poll(() => page.evaluate(() => {
+    const r = window.__regression
+    return Math.hypot(r.tank.x + 16 - (r.hospital.x + r.hospital.width / 2) * 32,
+      r.tank.y + 16 - (r.hospital.y + r.hospital.height / 2) * 32)
+  }), { timeout: 30000 }).toBeLessThan(await page.evaluate(() => window.__regression.initialDistance - 64))
+  await expect.poll(() => page.evaluate(() => {
+    const r = window.__regression
+    return r.tank.crew.gunner && !r.tank.returningToHospital && !r.tank.needsHospital
+  }), { timeout: 60000 }).toBe(true)
+})
diff --git a/tests/e2e/helpers/regressionScenario.js b/tests/e2e/helpers/regressionScenario.js
new file mode 100644
index 00000000..d98ce641
--- /dev/null
+++ b/tests/e2e/helpers/regressionScenario.js
@@ -0,0 +1,72 @@
+export async function prepareRegressionScenario(page, seed) {
+  await page.addInitScript(() => {
+    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
+    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
+  })
+  await page.goto(`/?seed=${seed}`)
+  await page.waitForFunction(() => Boolean(
+    window.gameState?.gameStarted && window.gameInstance?.units && window.cheatSystem && window.unitCommandsHandler
+  ), null, { timeout: 30000 })
+  await page.evaluate(() => {
+    document.querySelector('[aria-label="Skip tutorial"]')?.click()
+    document.getElementById('benchmarkModalCloseBtn')?.click()
+    const gs = window.gameState
+    const units = window.gameInstance.units
+    gs.gamePaused = true
+    // Keep both bases alive, but remove starting armies and prepare a flat arena.
+    units.splice(0)
+    gs.bullets?.splice(0)
+    for (const factory of gs.factories || []) factory.budget = 0
+    gs.buildings = gs.buildings.filter(b => b.x < 16 || b.x > 40 || b.y < 16 || b.y > 40)
+    for (let y = 16; y <= 40; y++) {
+      for (let x = 16; x <= 40; x++) {
+        const tile = gs.mapGrid[y][x]
+        tile.type = 'land'
+        tile.building = null
+        tile.ore = 0
+        tile.seedCrystal = null
+        if (gs.occupancyMap?.[y]) gs.occupancyMap[y][x] = 0
+      }
+    }
+    gs.scrollOffset.x = 16 * 32
+    gs.scrollOffset.y = 16 * 32
+    gs.dragVelocity = { x: 0, y: 0 }
+    window.__regression = {
+      human: gs.humanPlayer || 'player1',
+      enemy: gs.humanPlayer === 'player2' ? 'player1' : 'player2',
+      unit(type, owner, x, y) {
+        const known = new Set(units.map(u => u.id))
+        gs.cursorX = x * 32
+        gs.cursorY = y * 32
+        window.cheatSystem.processCheatCode(`${type} 1 ${owner}`)
+        const unit = units.find(u => !known.has(u.id) && u.type === type && u.owner === owner)
+        if (!unit) throw new Error(`Failed to spawn ${type}`)
+        unit.x = x * 32
+        unit.y = y * 32
+        unit.tileX = Math.floor((unit.x + 16) / 32)
+        unit.tileY = Math.floor((unit.y + 16) / 32)
+        unit.path = []
+        unit.moveTarget = null
+        unit.target = null
+        unit.alertMode = false
+        return unit
+      },
+      building(type, owner, x, y) {
+        const known = new Set(gs.buildings.map(b => b.id))
+        gs.cursorX = x * 32
+        gs.cursorY = y * 32
+        window.cheatSystem.processCheatCode(`build ${type} ${owner}`)
+        const building = gs.buildings.find(b => !known.has(b.id) && b.type === type && b.owner === owner)
+        if (!building) throw new Error(`Failed to spawn ${type}`)
+        return building
+      }
+    }
+  })
+}
+
+// Negative assertions must span actual simulation time, including several weapon cooldowns.
+export async function observeSimulation(page, milliseconds) {
+  const start = await page.evaluate(() => window.gameState.simulationTime)
+  await page.waitForFunction(({ start, milliseconds }) => window.gameState.simulationTime >= start + milliseconds,
+    { start, milliseconds }, { timeout: 30000 })
+}
diff --git a/tests/e2e/rocketTankAirAndMoveRegression.test.js b/tests/e2e/rocketTankAirAndMoveRegression.test.js
new file mode 100644
index 00000000..01ed1af2
--- /dev/null
+++ b/tests/e2e/rocketTankAirAndMoveRegression.test.js
@@ -0,0 +1,41 @@
+import { test, expect } from '@playwright/test'
+import { prepareRegressionScenario, observeSimulation } from './helpers/regressionScenario.js'
+
+test('rocket tank damages an airborne Apache and stops its burst on a move order', async({ page }) => {
+  await prepareRegressionScenario(page, 212)
+  await page.evaluate(() => {
+    const r = window.__regression
+    r.rocket = r.unit('rocketTank', r.human, 22, 24)
+    r.apache = r.unit('apache', r.enemy, 27, 24)
+    r.apache.flightState = 'airborne'
+    r.apache.altitude = r.apache.maxAltitude || 90
+    r.apache.manualFlightState = 'takeoff'
+    r.apache.autoHoldAltitude = true
+    r.apache.llmOrderLockUntil = Number.MAX_SAFE_INTEGER
+    r.apache.rocketAmmo = 0
+    r.apache.canFire = false
+    r.apache.health = r.apache.maxHealth = 10000
+    r.health = r.apache.health
+    r.rocket.target = r.apache
+    r.rocket.ammunition = 100
+    r.rocket.allowedToAttack = true
+    window.gameState.gamePaused = false
+  })
+  await expect.poll(() => page.evaluate(() => window.__regression.apache.health), { timeout: 20000 })
+    .toBeLessThan(10000)
+  await page.evaluate(() => {
+    const r = window.__regression
+    window.unitCommandsHandler.handleMovementCommand([r.rocket], 22 * 32, 30 * 32, window.gameState.mapGrid)
+    r.moveAmmo = r.rocket.ammunition
+    r.moveShotTime = r.rocket.lastShotTime
+    r.startY = r.rocket.y
+  })
+  await observeSimulation(page, 6000)
+  expect(await page.evaluate(() => {
+    const r = window.__regression
+    return { target: r.rocket.target?.id || null, ammo: r.rocket.ammunition, lastShot: r.rocket.lastShotTime, moved: r.rocket.y > r.startY }
+  })).toEqual(await page.evaluate(() => {
+    const r = window.__regression
+    return { target: null, ammo: r.moveAmmo, lastShot: r.moveShotTime, moved: true }
+  }))
+})
diff --git a/tests/unit/aiHospitalReturn.test.js b/tests/unit/aiHospitalReturn.test.js
new file mode 100644
index 00000000..9fcc41cd
--- /dev/null
+++ b/tests/unit/aiHospitalReturn.test.js
@@ -0,0 +1,50 @@
+import { beforeEach, describe, expect, it, vi } from 'vitest'
+import { manageAICrewHealing } from '../../src/ai/crewHealing.js'
+import { getCachedPath } from '../../src/game/pathfinding.js'
+
+vi.mock('../../src/game/pathfinding.js', () => ({ getCachedPath: vi.fn() }))
+vi.mock('../../src/game/ambulanceSystem.js', () => ({ assignAmbulanceToHealUnit: vi.fn(() => false) }))
+vi.mock('../../src/ai/enemyUtils.js', () => ({ getActiveAIPlayers: vi.fn(() => ['player2']) }))
+
+describe('AI hospital return routing', () => {
+  beforeEach(() => vi.clearAllMocks())
+
+  function scenario(owner) {
+    const hospital = { id: 'hospital', type: 'hospital', owner, health: 100, x: 5, y: 5, width: 2, height: 2 }
+    const unit = {
+      id: 'tank', type: 'tank_v1', owner, health: 100,
+      x: 12 * 32 + 20, y: 15 * 32, tileX: 0, tileY: 0,
+      crew: { driver: true, commander: true, loader: true, gunner: false }
+    }
+    const state = { buildings: [hospital], mapGrid: Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => ({ type: 'land' }))) }
+    return { hospital, unit, state }
+  }
+
+  it('uses the unit center for the path origin and tile coordinates for the move target', () => {
+    const { hospital, unit, state } = scenario('ai-hospital-coordinates')
+    const route = [{ x: 13, y: 15 }, { x: 6, y: 8 }]
+    getCachedPath.mockReturnValue(route)
+
+    manageAICrewHealing([unit], state, 6000, unit.owner)
+
+    expect(getCachedPath).toHaveBeenCalledWith(
+      { x: 13, y: 15, owner: unit.owner }, { x: 6, y: 8 }, state.mapGrid, null, { unitOwner: unit.owner }
+    )
+    expect(unit.path).toBe(route)
+    expect(unit.moveTarget).toEqual({ x: 6, y: 8 })
+    expect(unit.returningToHospital).toBe(true)
+    expect(unit.hospitalTarget).toBe(hospital)
+  })
+
+  it('retries a route that was initially unreachable instead of retaining a false return state', () => {
+    const { unit, state } = scenario('ai-hospital-retry')
+    getCachedPath.mockReturnValue([])
+    manageAICrewHealing([unit], state, 6000, unit.owner)
+    expect(unit.returningToHospital).toBe(false)
+
+    getCachedPath.mockReturnValue([{ x: 13, y: 15 }, { x: 6, y: 8 }])
+    manageAICrewHealing([unit], state, 12000, unit.owner)
+    expect(unit.returningToHospital).toBe(true)
+    expect(unit.moveTarget).toEqual({ x: 6, y: 8 })
+  })
+})
diff --git a/prompt-history/2026-10-14T19-07-23Z_four-e2e-regressions.md b/prompt-history/2026-10-14T19-07-23Z_four-e2e-regressions.md
new file mode 100644
index 00000000..538d89a5
--- /dev/null
+++ b/prompt-history/2026-10-14T19-07-23Z_four-e2e-regressions.md
@@ -0,0 +1,56 @@
+# Prompt history
+
+UTC: 2026-10-14T19:07:23.962407+00:00
+Harness: Codex
+Model: GPT-6 (exact variant/version and reasoning level are not exposed to this session).
+Token usage and exact task duration are unavailable and omitted.
+
+## Prompt
+
+You are working in a git repository checked out at the current directory (branch codex/write-4-permanent-playwright-e2e-20261014-210055-27e1d7, based on main).
+Follow the repository's own instructions (AGENTS.md etc.) for code style, docs and tests, but do not commit, push, or change git remotes; the operator commits for you.
+Stay inside this directory. Network access is disabled in the sandbox. Do not add secrets or credentials.
+TASK:
+Write 4 permanent Playwright E2E regression tests and fix issues 2-5 as described in the context file
+
+CONTEXT:
+Repo: code-for-battle (vanilla JS RTS, Vite). Follow AGENTS.md strictly (English, lint clean, docs/changes note per issue, English prompt-history entry).
+You have NO network and cannot run Playwright/browsers. Write Playwright E2E tests anyway; a human will run them and send failures back.
+
+Handle FOUR issues. For EACH: (a) write a new permanent Playwright E2E test in tests/e2e/ following existing patterns (see tests/e2e/apacheAutoReturnHelipad.test.js, enemyAirTargetEligibility.test.js: goto '/?seed=N', wait for window.gameState/gameInstance/cheatSystem, skip tutorial, spawn units/buildings via cheat system or direct gameState manipulation, then assert behaviour with page.waitForFunction / expect.poll against game state). Tests must be deterministic and fail on the buggy behaviour. (b) Investigate the source code and fix the bug if present.
+
+Issue 2: Defense turrets and tanks fire through buildings (TODO/Bugs.md "Defense turrets should not fire through buildings" and related). Shots must need line of sight, or buildings must block projectiles. Test: place turret/tank, a building between it and an enemy target; assert no firing / no damage through the building (target health unchanged), and that it does fire with a clear line.
+Issue 3: Rocket tank rockets don't detonate on airborne targets and fire at the move destination (Bugs "Rocket tank rockets should detonate on airborne targets and stop firing at move destinations"). Test: rocket tank vs airborne Apache -> Apache takes damage; rocket tank given a move order with no target -> fires no rockets.
+Issue 4: Multiple Apaches land on the same helipad when ordered one at a time; hovering an occupied helipad should show a blocked cursor (Bugs "Prevent multiple Apaches from landing on the same helipad", Improvements L74). Test: two Apaches, each individually ordered to the same helipad -> second must not land on the occupied pad (redirect to another free pad or stay airborne); cursor over occupied pad shows blocked state.
+Issue 5: Enemy AI should send tanks missing crew members back to the hospital before continuing battle (Bugs item 7, spec specs/003-hospital-crew-system/spec.md). Test: enemy tank with missing crew and an enemy hospital -> AI moves it toward the hospital / it gets restored.
+
+Also: add npm script "test:e2e:regressions" running exactly these 4 new files with --project=chromium. Do NOT change vitest config exclusion of tests/e2e. Do NOT edit TODO checkbox lines except ticking items you actually fixed. Put the four docs/changes notes as separate files. Summarize at the end per issue: whether you believe the bug existed in code, what you changed, the test file name.
+
+## Repository instructions supplied with the prompt
+
+RULES for agentic codeing
+1) running a development server is allowed when required for verification/debugging (especially Playwright E2E), and should be used when a task depends on a live app runtime. You HAVE to run all unit tests using "npm run test:unit" before concluding your code changes and fix all issues in a meaningful way (means fix the root issues in the code and not just adjust the test to pass).
+2) after completing any code implementation, always run `npm run lint:fix:changed` to auto-fix linting issues. If any errors remain that cannot be auto-fixed, manually resolve them before finishing the task.
+3) with every prompt, record the feature, improvement, or bug in a new markdown file under `docs/changes/`. Name it `YYYY-MM-DD-<short-slug>.md` or `<pr-or-issue>-<slug>.md`. Do not append that note to the shared files `TODO/Bugs.md`, `TODO/Features.md`, or `TODO/Improvements.md`. Those three files are edited by almost every branch; on this invite-code branch `TODO/Features.md` had to be merged with main's offline-mode notes (#720) and `TODO/Bugs.md` conflicted on an earlier rebase of the same branch against main. Classify the note the same way those files used to: a bug is something broken or contrary to intended/spec'd behavior, an improvement is polish of something that already exists (performance, UX, refactors, balance), and a feature is a new capability. Use `- [ ]` while the work is open and `- [x]` when it is finished, a short **bold title**, one description line, and `Spec: [Title](../specs/....md)` or `Spec: none`. Spec content for a new feature goes in its own new file under `specs/`. Do not append that feature's requirements to an existing shared spec. A dedicated cleanup PR periodically consolidates `docs/changes/` back into `TODO/Bugs.md`, `TODO/Features.md`, and `TODO/Improvements.md`.
+4) put the content of any prompt into the prompt-history folder and for each prompt create a new file inside that folder that has the UTC timestamp as its name followed by an underscore and up to 3 word summary (with dashes as separators) of the prompt so a user can quickly identify what the prompt was about when reading the filename. The file is and .md file with UTC timestamp added on top and the name of the LLM that processed it (copilot, chatGPT, codex, ...).
+5) when adding new buildings to the game the sidebar image can be found in public/images/sidebar and the image to render the building on the map in public/images/map/buildings
+6) when adding new units to the game the sidebar image can be found in public/images/sidebar and the image to render the unit on the map in public/images/map/units
+7) when the image assets for the new units are not specified in the prompt search the content of the folders mentioned in rule 5 and 6 for matching filenames. The names should be self explanatory so you could easily match them to the new units or buildings that you have to implement. The assets are usually added to the repo before you have to start the implementation.
+8) ALL LAND UNITS (tanks, trucks, harvesters, etc.) must spawn from the Vehicle Factory, not the Construction Yard. Apache helicopters spawn from Helipads. When adding a new land unit, always add it to the `vehicleUnitTypes` array in `src/productionQueue.js` to ensure proper spawn location.
+9) Anser every prompt (when you actually changed code) with a last section that contains a commit message describing your last changes for the user to copy paste
+10) !DISABLED FOR NOW!: for every implemented bugfix or feature request, always add a meaningful E2E test that verifies the implementation end-to-end. The workflow is mandatory: first implement the bugfix/feature, then in the same task implement the E2E test, run it, and keep improving code and/or test until the E2E test passes. The E2E test must stay behavior-driven and meaningful (the implementation must satisfy the real behavior being tested, not the test being weakened to fit current code).
+11) SELF-BLOCKING OCCUPANCY WARNING: A unit's occupied tile MUST always be determined by the CENTER of the unit's image (`Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)`), NOT the top-left corner (`Math.floor(unit.x / TILE_SIZE)`). Additionally, the physics/collision system MUST always exclude a unit's own occupancy tile from blocking checks — otherwise the unit gets pushed away from its own tile, triggering pathfinding reroute loops. This has been a recurring source of bugs. When implementing any new feature or fixing bugs that involve occupancy, tile position, pathfinding, or collision logic, always verify: (a) tile position uses center-based formula, (b) self-occupancy is excluded in collision/blocking checks, (c) `unit.tileX`/`unit.tileY` assignment uses center-based formula.
+12) HOT-LOOP PERFORMANCE GATE: Before changing code that runs every simulation tick, animation frame, entity render, or selected-unit overlay, explicitly identify the call frequency and multiply the proposed work by the expected entity count and device pixel ratio. Initialization/normalization helpers called from hot loops MUST be idempotent and preserve object/array identity after the first call; do not rebuild entity state, clone arrays, construct `Set`/`Map` instances, or allocate per-frame helper objects unless a measured benchmark proves the cost is safe. Do not perform `units.find(...)`, `buildings.find(...)`, or other linear scans inside a per-entity/per-turret loop; build or reuse one indexed lookup for the frame and skip lookup work entirely when no target/id exists.
+13) CANVAS OVERDRAW WARNING: Never add large translucent fills, gradients, shadows, filters, dashed paths, or clips whose pixel area scales with weapon range/map size to a per-frame canvas path without measuring raster cost at the actual high-DPI backing resolution. Range/selection indicators should render only their visible boundary, cull themselves when that boundary is outside the viewport, and avoid full-viewport alpha blending. Keep independent sprite layers to the minimum draw calls required by the behavior and cache only when the cache is bounded and demonstrably cheaper.
+14) STRICT 75 FPS PERFORMANCE GATE: Unit tests and lint do not detect FPS regressions. All new code changes must preserve a minimum of 75 FPS during fast scrolling and the feature's active worst case on the qualifying reference hardware, at unchanged visual quality and settings. The frame deadline is 1000/75 = 13.333... ms. For every update/render hot-path change, run representative before/after live benchmarks including cold first traversal after preparation, repeated full-map scrolling, selected layered units, firing effects, movement, procedural water, and realistic entity counts. Record independently measured FPS, frame-time p95/p99/max and missed deadlines, CPU update/render time, actual backend/DPR, GPU timing where available, and memory/GC evidence. Do not finish or mark performance work complete while application-caused frames miss the 75 FPS deadline. The previous 20% regression allowance and lower 30/40/60 FPS floors are superseded; a relative improvement below 75 FPS does not pass. Do not reduce resolution, detail, effects, animation cadence, or visual fidelity to pass. Add/update focused reproducible performance coverage and document exact commands/results in the affected spec. A display/browser limited below 75 Hz, headless/software-only run, or externally throttled session cannot certify 75 presented FPS: report that limitation and retain the qualifying-hardware check as outstanding, never silently lower the gate. See performance_improvement.md for the acceptance protocol.
+15) Always name the exact model you are running for each prompt in the prompt hisotry not just the harness or model family like "codex". I want exact model name with reasoning level if possible and exact version of the model! Also put there how many token you used for input, visible output and reasoning and how long the entire task took! If available also put in which harness was used! Example:
+"Codex using GPT5.6-Sol(High) took 18m15s (50k in/500 visible_out/20k resoning)". If the exact numbers cannot be provided ensure the numbers are left out and NOT filled with hallucinated ones.
+16) in each response to a prompt ensure that you put a commit message (conventional commits) in the end that contains a title and a few lines of description below in bullet point what was done/fixed in a box that user can copy paste.
+17) All new image and other binary asset files added to the repository MUST use WebP format with 85% compression. Do not add new PNG, JPG, or other binary formats.
+18) PREPARED RENDERING REQUIREMENT: Prepare static terrain, final-size map/entity imagery, masks, shaders and necessary texture uploads before gameplay where possible, using explicit readiness and bounded byte budgets. Do not perform ordinary source-image resizing or lazily build resized sprite variants during gameplay; plane/helicopter takeoff and landing size animations are the only authorized animation exceptions. Preserve continuous rotation, clipping, procedural-water animation and existing visuals. Account for effective canvas DPR when auditing resizing. Handle explicit display/graphics changes through a controlled preparation-and-swap lifecycle. If another dynamic visual cannot satisfy this policy without deterioration, document the conflict instead of silently exempting it or degrading the image. Follow rendering_improvement_todos.md for staged ownership and implementation.
+19) Codebase prompt-history entries are always written in English, regardless of the language of the user's message. When the user wrote the request in German or any other language, translate it into English in the new file under `prompt-history/`. Do not rewrite older prompt-history files.
+20) Before every commit, run `npm run lint` and fix every reported issue. Never weaken, disable, or skip lint rules to make CI pass, and never omit the lint step from CI.
+
+## Git / Workflow
+
+Never merge `main` into a feature branch, and never create merge commits. Update a feature branch with `git fetch && git rebase origin/main`, then push with `git push --force-with-lease`. Merge pull requests without merge commits (squash or rebase).
diff --git a/prompt-history/2026-10-14T19-13-33Z_fix-regression-checks.md b/prompt-history/2026-10-14T19-13-33Z_fix-regression-checks.md
new file mode 100644
index 00000000..ca37c7b6
--- /dev/null
+++ b/prompt-history/2026-10-14T19-13-33Z_fix-regression-checks.md
@@ -0,0 +1,13 @@
+# 2026-10-14T19:13:33Z
+
+Harness: Codex. Model: GPT-6 (exact model revision and reasoning level unavailable). Token counts and task duration unavailable.
+
+## Request
+
+Work in the current repository without committing, pushing, changing remotes, using the network, or running browsers. Follow AGENTS.md. Complete/review four permanent Playwright regressions for issues 2–5: building obstruction for tanks/turrets, rocket tank airborne hits and move-order firing cancellation, individual Apache helipad occupancy and blocked cursor, and enemy tanks returning to hospitals for missing crew. Investigate and fix bugs where present. Keep four separate change notes and a Chromium script selecting exactly those files; leave Vitest configuration exclusions unchanged and do not edit unrelated TODO checkboxes. Summarize each issue and its test filename.
+
+Fix the reported check failure: all 4,946 Vitest assertions passed, but 77 Playwright suites were also collected by Vitest, causing “Playwright Test did not expect test/test.describe/test.use to be called here” errors. Do not disable tests or lint rules. Run npm run test:unit, npm run lint:fix:changed, and lint. Browser runs remain for the human operator.
+
+## Outcome
+
+Scoped the npm test command to the complete unit and integration directories without changing Vitest configuration. Reviewed the four permanent browser regressions and existing hospital routing implementation. Updated the four issue notes and hospital spec with current validation evidence. npm run test:unit passed (4,860 tests); npm test passed (4,946 tests); changed-file lint, full lint, and diff whitespace checks passed. No browser or hardware performance validation was attempted, and no commits, pushes, or remote changes were made.
diff --git a/tests/unit/enemyUnitBehavior.test.js b/tests/unit/enemyUnitBehavior.test.js
index 9e5e4083..d1d10ae7 100644
--- a/tests/unit/enemyUnitBehavior.test.js
+++ b/tests/unit/enemyUnitBehavior.test.js
@@ -134,6 +134,46 @@ describe('enemyUnitBehavior updateAIUnit', () => {
     expect(unit.path).toEqual([])
   })
 
+  it('preserves the hospital route before strategic retreat decisions', () => {
+    const route = [{ x: 5, y: 8 }, { x: 5, y: 7 }]
+    const destination = { x: 5, y: 7 }
+    const unit = createBaseUnit({
+      crew: { driver: true, commander: true, loader: true, gunner: false },
+      returningToHospital: true,
+      hospitalTarget: { id: 'hospital-1', health: 100 },
+      path: route,
+      moveTarget: destination,
+      isRetreating: true,
+      isBeingAttacked: true,
+      lastDamageTime: now,
+      lastAttacker: { id: 'attacker', owner: 'player', health: 100 },
+      target: { id: 'offensive-target', owner: 'player', health: 100 }
+    })
+
+    updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])
+
+    expect(applyEnemyStrategies).not.toHaveBeenCalled()
+    expect(unit.path).toBe(route)
+    expect(unit.moveTarget).toBe(destination)
+    expect(unit.target).toBeNull()
+  })
+
+  it('releases hospital return state after arrival has cleared the move target', () => {
+    const unit = createBaseUnit({
+      crew: { driver: true, commander: true, loader: true, gunner: true },
+      returningToHospital: true,
+      hospitalTarget: { id: 'hospital-1', health: 100 },
+      needsHospital: true,
+      moveTarget: null
+    })
+
+    updateAIUnit(unit, [unit], gameState, mapGrid, now, 'ai', [], [])
+
+    expect(unit.returningToHospital).toBe(false)
+    expect(unit.hospitalTarget).toBeNull()
+    expect(unit.needsHospital).toBe(false)
+  })
+
   it('routes ambulances to hospitals when crew needs refilling', () => {
     const hospital = { id: 'hospital-1', type: 'hospital', owner: 'ai', health: 100, x: 5, y: 5, width: 2, height: 2 }
     gameState.buildings = [hospital]
```

Human ran the 4 E2E tests in a real browser. ALL 4 FAIL both on unmodified main and with the patch's fixes. Note: window.gameState.bullets does NOT exist (bullets are module-local in gameOrchestrator; the helper now uses gs.bullets?.splice). A probe confirmed: the simulation runs after gamePaused=false, simulationTime advances, a tank-v2 targeting an enemy tank_v1 4 tiles away in open terrain fires and damages it (ammunition 50->40 in 4s), a cheat-spawned apache starts flightState 'airborne' altitude 144. Apache keys: flightState, altitude, helipadLandingRequested, helipadTargetId, landedHelipadId, requiresHelipad, manualFlightState.
Read the code carefully to determine for each failure whether the TEST SETUP is wrong (wrong API, field name, coordinates, unit type ids, cheat syntax, building footprints, etc.) or the GAME has the bug. Fix the tests so they are a correct reproduction, and fix genuine game bugs. Make test failures self-explanatory (include relevant state in expect messages). In the docs/changes notes, state per issue whether it was a real bug on main.

## Human failure evidence supplied with the prompt

With fixes applied, using two Chromium workers:

- Building line-of-sight regression: the final conjunction (tank ammunition decreased, turret ammunition decreased, enemy health decreased) stayed false for 15,000ms; tests/e2e/buildingLineOfSightRegression.test.js:44.
- Apache helipad regression: first.landedHelipadId stayed null instead of helipad ID "60939ro1" for 30,000ms; tests/e2e/apacheHelipadOccupancyRegression.test.js:21.
- Rocket tank regression: Apache health stayed 10000 instead of less than 10000 for 20,000ms; tests/e2e/rocketTankAirAndMoveRegression.test.js:24.
- Hospital regression: final conjunction (gunner restored, returningToHospital and needsHospital cleared) stayed false for 60,000ms; tests/e2e/enemyHospitalCrewRegression.test.js:28.

Unmodified main, using two Chromium workers:

- The same line-of-sight final conjunction stayed false for 15,000ms.
- The same first Apache landing ID stayed null instead of "60939ro1" for 30,000ms.
- Hospital route assignment conjunction (returningToHospital, matching hospitalTarget, moveTarget coordinates smaller than map dimensions) stayed false for 15,000ms; tests/e2e/enemyHospitalCrewRegression.test.js:18.
- Rocket tank Apache damage check stayed at 10000 for 20,000ms.

## Repository instructions

RULES for agentic codeing
1) running a development server is allowed when required for verification/debugging (especially Playwright E2E), and should be used when a task depends on a live app runtime. You HAVE to run all unit tests using "npm run test:unit" before concluding your code changes and fix all issues in a meaningful way (means fix the root issues in the code and not just adjust the test to pass).
2) after completing any code implementation, always run `npm run lint:fix:changed` to auto-fix linting issues. If any errors remain that cannot be auto-fixed, manually resolve them before finishing the task.
3) with every prompt, record the feature, improvement, or bug in a new markdown file under `docs/changes/`. Name it `YYYY-MM-DD-<short-slug>.md` or `<pr-or-issue>-<slug>.md`. Do not append that note to the shared files `TODO/Bugs.md`, `TODO/Features.md`, or `TODO/Improvements.md`. Those three files are edited by almost every branch; on this invite-code branch `TODO/Features.md` had to be merged with main's offline-mode notes (#720) and `TODO/Bugs.md` conflicted on an earlier rebase of the same branch against main. Classify the note the same way those files used to: a bug is something broken or contrary to intended/spec'd behavior, an improvement is polish of something that already exists (performance, UX, refactors, balance), and a feature is a new capability. Use `- [ ]` while the work is open and `- [x]` when it is finished, a short **bold title**, one description line, and `Spec: [Title](../specs/....md)` or `Spec: none`. Spec content for a new feature goes in its own new file under `specs/`. Do not append that feature's requirements to an existing shared spec. A dedicated cleanup PR periodically consolidates `docs/changes/` back into `TODO/Bugs.md`, `TODO/Features.md`, and `TODO/Improvements.md`.
4) put the content of any prompt into the prompt-history folder and for each prompt create a new file inside that folder that has the UTC timestamp as its name followed by an underscore and up to 3 word summary (with dashes as separators) of the prompt so a user can quickly identify what the prompt was about when reading the filename. The file is and .md file with UTC timestamp added on top and the name of the LLM that processed it (copilot, chatGPT, codex, ...).
5) when adding new buildings to the game the sidebar image can be found in public/images/sidebar and the image to render the building on the map in public/images/map/buildings
6) when adding new units to the game the sidebar image can be found in public/images/sidebar and the image to render the unit on the map in public/images/map/units
7) when the image assets for the new units are not specified in the prompt search the content of the folders mentioned in rule 5 and 6 for matching filenames. The names should be self explanatory so you could easily match them to the new units or buildings that you have to implement. The assets are usually added to the repo before you have to start the implementation.
8) ALL LAND UNITS (tanks, trucks, harvesters, etc.) must spawn from the Vehicle Factory, not the Construction Yard. Apache helicopters spawn from Helipads. When adding a new land unit, always add it to the `vehicleUnitTypes` array in `src/productionQueue.js` to ensure proper spawn location.
9) Anser every prompt (when you actually changed code) with a last section that contains a commit message describing your last changes for the user to copy paste
10) !DISABLED FOR NOW!: for every implemented bugfix or feature request, always add a meaningful E2E test that verifies the implementation end-to-end. The workflow is mandatory: first implement the bugfix/feature, then in the same task implement the E2E test, run it, and keep improving code and/or test until the E2E test passes. The E2E test must stay behavior-driven and meaningful (the implementation must satisfy the real behavior being tested, not the test being weakened to fit current code).
11) SELF-BLOCKING OCCUPANCY WARNING: A unit's occupied tile MUST always be determined by the CENTER of the unit's image (`Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)`), NOT the top-left corner (`Math.floor(unit.x / TILE_SIZE)`). Additionally, the physics/collision system MUST always exclude a unit's own occupancy tile from blocking checks — otherwise the unit gets pushed away from its own tile, triggering pathfinding reroute loops. This has been a recurring source of bugs. When implementing any new feature or fixing bugs that involve occupancy, tile position, pathfinding, or collision logic, always verify: (a) tile position uses center-based formula, (b) self-occupancy is excluded in collision/blocking checks, (c) `unit.tileX`/`unit.tileY` assignment uses center-based formula.
12) HOT-LOOP PERFORMANCE GATE: Before changing code that runs every simulation tick, animation frame, entity render, or selected-unit overlay, explicitly identify the call frequency and multiply the proposed work by the expected entity count and device pixel ratio. Initialization/normalization helpers called from hot loops MUST be idempotent and preserve object/array identity after the first call; do not rebuild entity state, clone arrays, construct `Set`/`Map` instances, or allocate per-frame helper objects unless a measured benchmark proves the cost is safe. Do not perform `units.find(...)`, `buildings.find(...)`, or other linear scans inside a per-entity/per-turret loop; build or reuse one indexed lookup for the frame and skip lookup work entirely when no target/id exists.
13) CANVAS OVERDRAW WARNING: Never add large translucent fills, gradients, shadows, filters, dashed paths, or clips whose pixel area scales with weapon range/map size to a per-frame canvas path without measuring raster cost at the actual high-DPI backing resolution. Range/selection indicators should render only their visible boundary, cull themselves when that boundary is outside the viewport, and avoid full-viewport alpha blending. Keep independent sprite layers to the minimum draw calls required by the behavior and cache only when the cache is bounded and demonstrably cheaper.
14) STRICT 75 FPS PERFORMANCE GATE: Unit tests and lint do not detect FPS regressions. All new code changes must preserve a minimum of 75 FPS during fast scrolling and the feature's active worst case on the qualifying reference hardware, at unchanged visual quality and settings. The frame deadline is 1000/75 = 13.333... ms. For every update/render hot-path change, run representative before/after live benchmarks including cold first traversal after preparation, repeated full-map scrolling, selected layered units, firing effects, movement, procedural water, and realistic entity counts. Record independently measured FPS, frame-time p95/p99/max and missed deadlines, CPU update/render time, actual backend/DPR, GPU timing where available, and memory/GC evidence. Do not finish or mark performance work complete while application-caused frames miss the 75 FPS deadline. The previous 20% regression allowance and lower 30/40/60 FPS floors are superseded; a relative improvement below 75 FPS does not pass. Do not reduce resolution, detail, effects, animation cadence, or visual fidelity to pass. Add/update focused reproducible performance coverage and document exact commands/results in the affected spec. A display/browser limited below 75 Hz, headless/software-only run, or externally throttled session cannot certify 75 presented FPS: report that limitation and retain the qualifying-hardware check as outstanding, never silently lower the gate. See performance_improvement.md for the acceptance protocol.
15) Always name the exact model you are running for each prompt in the prompt hisotry not just the harness or model family like "codex". I want exact model name with reasoning level if possible and exact version of the model! Also put there how many token you used for input, visible output and reasoning and how long the entire task took! If available also put in which harness was used! Example:
"Codex using GPT5.6-Sol(High) took 18m15s (50k in/500 visible_out/20k resoning)". If the exact numbers cannot be provided ensure the numbers are left out and NOT filled with hallucinated ones.
16) in each response to a prompt ensure that you put a commit message (conventional commits) in the end that contains a title and a few lines of description below in bullet point what was done/fixed in a box that user can copy paste.
17) All new image and other binary asset files added to the repository MUST use WebP format with 85% compression. Do not add new PNG, JPG, or other binary formats.
18) PREPARED RENDERING REQUIREMENT: Prepare static terrain, final-size map/entity imagery, masks, shaders and necessary texture uploads before gameplay where possible, using explicit readiness and bounded byte budgets. Do not perform ordinary source-image resizing or lazily build resized sprite variants during gameplay; plane/helicopter takeoff and landing size animations are the only authorized animation exceptions. Preserve continuous rotation, clipping, procedural-water animation and existing visuals. Account for effective canvas DPR when auditing resizing. Handle explicit display/graphics changes through a controlled preparation-and-swap lifecycle. If another dynamic visual cannot satisfy this policy without deterioration, document the conflict instead of silently exempting it or degrading the image. Follow rendering_improvement_todos.md for staged ownership and implementation.
19) Codebase prompt-history entries are always written in English, regardless of the language of the user's message. When the user wrote the request in German or any other language, translate it into English in the new file under `prompt-history/`. Do not rewrite older prompt-history files.
20) Before every commit, run `npm run lint` and fix every reported issue. Never weaken, disable, or skip lint rules to make CI pass, and never omit the lint step from CI.

## Git / Workflow

Never merge `main` into a feature branch, and never create merge commits. Update a feature branch with `git fetch && git rebase origin/main`, then push with `git push --force-with-lease`. Merge pull requests without merge commits (squash or rebase).


## Outcome

Applied the supplied starting changes using git apply. Kept the four-file Chromium script and Vitest configuration unchanged. Corrected fixtures and diagnostics, fixed rocket hull/altitude firing alignment and Apache settling-state persistence, per-pad timer ownership and center-based touchdown coordinates, and retained hospital routing/priority/completion fixes. Independent runtime coverage uses real movement, combat, projectiles, pathfinding and service logic with audio/UI entry points mocked. No browser execution, commits, pushes or remote changes. Final validation results and outstanding browser/performance checks are recorded in the separate issue notes.

Final checks: `npm run test:unit` passed (256 files, 4,866 tests); `npm test` passed (258 files, 4,952 tests); `npm run lint:fix:changed`, `npm run lint` and `git diff --check` passed. The focused main baseline comparison failed nine targeted assertions (30 passed), including hospital route coordinates and rocket/Apache behavior; the line-of-sight runtime check passed on main. Human Chromium execution and qualifying-hardware 75 FPS acceptance remain outstanding.
