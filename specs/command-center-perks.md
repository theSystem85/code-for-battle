# Command Center, Stars Ledger, Veterancy and Automation Perk Tree — Final v1

Status: **Final v1** for the original tree (decisions D1–D14 and §§1–15). Follow-up polish after `d052b13e` is specified in **§16** and is not yet done.
Source requests: Patrick, chat messages t619u and t620u (2026-11-21); follow-up items from the perk-polish pass and the 2026-11-21 voice call.
Researched against `origin/dev` @ `c6cf8266` (2026-11-20 18:51 Berlin time, "fix(ios): recover startup terrain and sprite alignment"). §16 was checked against `origin/dev` @ `d052b13e` (2026-11-21, Europe/Berlin).
Repo location: `specs/command-center-perks.md` (AGENTS rule 3).

## Decisions (all final)

| # | Decision |
|---|---|
| D1 | **Four** start branches: base build, unit build, unit control, base defence. |
| D2 | Tree orientation: start perks form the top row and branches grow downward. The star totals are pinned at the bottom. |
| D3 | Stars count from match start, even before a Command Center exists. |
| D4 | The building-kill star bug is fixed (§5.2). |
| D5 | If the CC is destroyed, perks are kept. All of the owner's automations are suspended and purchases are blocked until a CC is rebuilt. |
| D6 | One CC per player. |
| D7 | Defence IF order: Sensing → Own unit → World. |
| D8 | The DO branches of build, unit build and defence gate individual actions or option values. |
| D9 | The game pauses while the Perk Tree is open in single-player, but keeps running in multiplayer. |
| D10 | Patrick: building kills give XP relative to the building's price (§5.2). |
| D11 | Patrick: the kill bonus. A unit that kills a starred unit also gets 50% of the victim's stars as extra XP (§5.3). |
| D12 | Patrick: the user manual is corrected (harvesters do earn stars). |
| D13 | Patrick: turret stars. Turrets show stars and gain veterancy, but only after the new **Turret Veterancy** capstone perk (5★). It sits in the defence tree as the final node that all branches merge into, and is buyable once **any** branch reaches its end. After the unlock, building/turret stars count toward the ledger. |
| D14 | Also adopted, as recommended: no respec in v1; a game setting "Automation perks: Required \| All unlocked", with old saves loading as All unlocked; AI only tracks stars (no purchases, no CC); costs as proposed, behind `PERK_COST_MULTIPLIER`; CC stats as proposed; the tree can be viewed without a CC; the CC is buildable by build automations (Support Blueprints). |
---

## 1. Summary

A new 3×3 building, the **Command Center (CC)**, unlocks after the Radar Station. It opens a **Perk Tree** where the player spends **stars**. Every experience star any of the player's units earns goes into a match-wide **stars ledger** that tracks earned, spent and available stars.

Perks gate the existing CFBL automation feature. Each of the four automation categories in code (build unit, build base, control unit, control base defence) gets a **start perk**. Each start perk has an **IF branch** (condition groups) and a **DO branch** (action groups or action options). Locked conditions and actions are disabled everywhere: the button editor, the CFBL text editor, validation, enable/apply, import and the runtime.

A 5★ capstone, **Turret Veterancy**, sits at the bottom of the defence tree and can be bought once any lane is completed. It gives turrets stars and veterancy bonuses, and from then on their stars count toward the ledger. The XP rules also change: building kills give XP based on the building's price, and killing a starred unit gives a 50% star bonus.

The perk tree is a full-screen, blurred, pannable DOM overlay with round futuristic badges. A perk's star cost shows in gray before purchase and in gold after it, in the unit-XP star style but larger.

Important consequence: **today every automation is available from second 0 of a match.** This feature takes that access away until the player has a CC and the matching perks. Tutorials, e2e tests and old saves therefore need an explicit escape hatch (§7, §10).

---

## 2. Patrick's requirements, restated

| # | Requirement |
|---|---|
| R1 | New building "Command Center", buildable after Radar. |
| R2 | Footprint 3×3. |
| R3 | The CC enables use of the CFBL automation feature, only for what the bought perks unlock. |
| R4 | The CC unlocks the perk feature. |
| R4.1 | Every star earned by any of the player's units goes into a global stars account. Buying a perk lowers the available stars. The perk menu always shows **total earned**, **available** and **used (spent)** stars. |
| R4.2 | A tech tree of command perks, bought with available stars. |
| R4.3 | An "upside-down" tree with **four start perks** (decided, D1): base build automation **2★**, unit build automation **3★**, unit control automation **5★**, base defence automation **2★**. |
| R4.4 | Each start perk has 2 follow-up branches: IF categories and DO categories, unlocked in order. For unit control: IF = "own unit", "world", "sensing"; DO = "service and support", "combat", "movement", "air". The other start perks get a similar, reasonable order. Follow-ups cost 1–3★ depending on power. |
| R4.5 | Buying a start perk also unlocks the first IF and the first DO perk of its branch, because an automation needs at least one of each. |
| R5 | Generate a sprite sheet full of CC map-image variants. Patrick picks one. A matching build-button image is then generated from it. |
| R6 | Each perk has a round, futuristic badge image with symbols for what it unlocks. |
| R7 | The perk modal is a full-screen overlay with a transparent, blurring background. It shows the tree, with star info at the bottom. Under each perk: its cost in gray when not owned, in gold when owned (unit-XP star rendering, larger). |
| R8 | Disable automations and IF/DO options whose perks are not active. |
| R9 | A visually stunning tree with hover effects, tooltips explaining each perk and how to use it, and links to the user manual. |
| R10 | The tree pans on desktop and mobile like the map does (same scroll mechanism). |
| R11 (t620u) | Building kills give XP relative to the building's price. |
| R12 (t620u) | A unit that kills a starred unit also gets 50% of the victim's stars as extra XP, on top of the normal kill XP. |
| R13 (t620u) | Correct the manual's harvester XP text. |
| R14 (t620u) | Turrets show stars and gain veterancy, gated by a 5★ capstone perk in the defence tree that any branch end unlocks. After the unlock, building stars count toward the ledger. |

---

## 3. Research findings (what the code does today)

### 3.1 Buildings

- **Data:** `src/data/buildingData.js`, one entry per `buildingData.<type>`:
  - `width`, `height`, `cost`, `power`, `image`, `displayName`, `health`, optional `armor`
  - `smokeSpots`, in source-image pixels
  - flags `requiresRadar`, `requiresVehicleFactory`, `requiresShoreline`
- **Comparable buildings:**

  | Type | Size | Cost | Power | HP | Extra |
  |---|---|---|---|---|---|
  | radarStation | 2×2 | 1500 | −50 | 200 | |
  | hospital | 3×3 | 4000 | −50 | 200 | |
  | vehicleWorkshop | 3×3 | 3000 | −20 | 300 | armor 3 |
  | fireDepartment | 3×3 | 2500 | −20 | 300 | |
  | constructionYard | 3×3 | 5000 | +50 | 350 | |
  | rocketTurret / teslaCoil | 2×2 | 4000 / 5000 | −20 / −60 | 200 / 250 | requiresRadar |

- **Build time** comes from the cost: `getProductionDuration(cost, true)` = `750 ms × cost/500 ÷ multipliers` (`src/production/timing.js`).
- **Prerequisites:**
  - `src/production/buildingRequirements.js` builds each requirement list once: CY, then Radar if `requiresRadar`, then the Power Plant → Refinery → Factory chain.
  - `src/production/techTree.js` `productionUnlockRules` handles event-driven unlocks. The Radar rule is `{ requires: ['radarStation'], units: ['tank-v2'], buildings: ['airstrip', 'turretGunV2', ...] }`, and the CC goes into its `buildings` list.
  - Hard-coded Radar checks also exist in `src/ui/productionControllerButtonSetup.js:218` and `productionControllerButtonStates.js:32`.
- **Wiring checklist for a new building**, from the Fire Department commit `9358a92c` and `skills/new-building-fire-integration.md`:
  - `buildingData`
  - `src/buildingImageMap.js`, with the map path `images/map/buildings/<name>.webp`
  - `index.html` sidebar `<button class="production-button" data-building-type="…">` with `images/sidebar/<name>.webp`
  - the short label map in `productionControllerButtonSetup.js`
  - the description in `productionTooltip.js`
  - `techTree.js` and `buildingRequirements.js`
  - the `scripts/build-prepared-sprites.mjs` entry `['commandCenter', 'command_center.webp', 3, 3]`, which produces `public/images/prepared/building/commandCenter/base@1x|2x|3x.webp` (96/192/288 px) and updates `public/images/prepared/sprite-manifest.json`
  - `src/ai-api/techTree.js` and `src/ai/llmStrategicDigest.js`
  - `src/ai/enemyAIPlayer.js`, only if the AI should build it
  - the sidebar image map in `src/ui/llmQueueTooltip.js`
  - `BUILDING_TYPES` in `src/policies/policyConditions.js`, so "Number of my buildings of type Command Center" works
  - optionally `BUILDABLE_TYPES` in `policyEffects.js`
  - `src/benchmark/graphicsTunerLayout.js` and `src/missions/mission_full_base_test.js`
  - `availableBuildingTypes` in `src/game/gameOrchestrator.js:1763`
  - the landing locales and the user manual
- **Image sizes:**
  - Older 3×3 map sprites are 192×192 RGBA (64 px per tile). The newest one, the Fire Department, is 384×384 (128 px per tile).
  - Sidebar buttons are 256×256 opaque RGB WebP.
  - New binaries must be WebP q85 (AGENTS rule 17).
  - The prompt template is `docs/BuildingImageAssetGenerationPromptTemplate.md`. Provenance goes under `docs/asset-sources/`.
- **Unused art already in the repo:** `public/images/map/buildings/technology_research_center_map.webp` (192×192, a ¾-view grey building with a dish, a dome and silos) and `public/images/sidebar/technology_research_center_sidebar.webp`. Nothing references them. They make good **style references** and an acceptable **placeholder** CC until Patrick picks the final art.
- **Enemy AI:** the build order is hand-coded in `src/ai/enemyAIPlayer.js` (Radar → rocket turret → Tesla …) and `src/ai/baseDefence.js`. The AI never writes or runs CFBL automations, so a CC has no gameplay value for the AI today.

### 3.2 Unit XP and stars

- **Combat units** (`src/utils.js`):
  - `awardExperience(unit, killed)` adds `round(getUnitCost(killed.type) × XP_MULTIPLIER)`, with `XP_MULTIPLIER = 3` (`config.js:234`).
  - `checkLevelUp` raises `unit.level` by **one per call** when `experience ≥ {1: 2×, 2: 4×, 3: 6×} × unit.baseCost`. It then **resets experience to 0**, so overflow is lost.
  - Units have at most **3 stars** (`unit.level` 0–3). The bonuses are in `applyLevelBonuses`.
- **Harvesters do earn stars**, through a separate path. `updateHarvesterExperience` in `src/game/harvesterLogic.js` gives 1 star per `HARVESTER_XP_FULL_UNLOADS_PER_STAR = 10` full unloads, inside a `while` loop.
  - ⚠️ The user manual (`public/docs/user-documentation.html#xp`) still says "Harvesters cannot level up", which is out of date. This is corrected by D12 (§11, phase P8).
- **Cheat path:** `setSelectedUnitsExperience` in `src/input/cheatSystem.js` calls `checkLevelUp`. The debug helpers in `utils.js` do too.
- **Gotcha 1, building kills give a free star (fixed by D10, §5.2):** `getUnitCost(type)` returns `UNIT_COSTS[type] || 9999999`, and buildings are not in `UNIT_COSTS`. Destroying any enemy building, even a concrete wall, gives ~30M XP, which is an **instant +1 star** (`bulletSystem.js:1048`). Left alone, building kills would dominate the star economy.
- **Gotcha 2, turrets level up invisibly (replaced by D13, §5.4):** defence buildings fire bullets with `shooter: building` (`buildingSystem.js:699`), so `awardExperience` gives levels to turrets. Nothing renders them.
- **A living unit can't lose stars.** No code lowers `unit.level`, and save load clamps it to 0..3. A unit's stars only vanish when the unit dies. A ledger that counts level-up events is therefore **monotonic and unaffected by death**, which fits R4.1.
- **Rendering:** `renderLevelStars` in `src/rendering/unitRenderer.js` draws `unit.level` five-point stars:
  - `starSize 6`, spacing 8
  - fill `#FFD700`, stroke `#FFA500`, lineWidth 1
  - outer radius `size/2`, inner radius `size/4`

  The perk overlay should reproduce this path as inline SVG at ~16–20 px.
- **Economy estimate:** when a Tank V1 (cost 1000) kills a Tank V1, it gets 3000 XP ≥ 2000, which is star 1. Two more kills reach star 2 (4000) and two more reach star 3 (6000). About 5 kills of equal value max out a unit.

### 3.3 Automations / CFBL: categories exactly as in code

**Automation categories (variants)**, from `policySchema` and the CFBL parser:

| Variant id | UI label ("Add automation to") | CFBL header | Scope | Start perk |
|---|---|---|---|---|
| `unitBuild` | build unit | `build unit` | global | unit build (3★) |
| `build` | build base | `build building` | global | base build (2★) |
| `unit` | control unit | `control unit` | individual or global | unit control (5★) |
| `defence` | control base defence | `control defence-building` | individual or global | base defence (2★) |

**Condition group labels** (`GROUPS` in `policyConditions.js`):
- `internal` = **"Own unit"**
- `external` = **"World"**
- `sensing` = **"Sensing"**
- `base` = **"My base"**
- `enemies` = **"Visible enemies"**

Unit and defence editors group conditions by `group`. Build and unitBuild editors group them by `buildGroup || group` (`atomGroupsFor` in `src/ui/policies/conditionRows.js`).

**Action group labels** (`EFFECT_GROUPS` in `policyEffects.js`):
- `combat` = **"Combat"**
- `movement` = **"Movement"**
- `air` = **"Air"**
- `service` = **"Service and support"**
- `construction` = **"Base construction"**
- `production` = **"Unit production"**

The item lists below were generated from the catalog. The legacy atoms come from `LEGACY_ATOMS` in `conditionRows.js`.

**control unit (`unit`)**
- **IF Own unit:** hp, xp, rank, fuel, ammo, reload, crew, load, rotation (wagon), turretRotation, airborne, moving, attacking, serving, + legacy `always`
- **IF World:** money, power, buildingCount, onFire, underService, underServiceByUnit, inServiceRange, protectedByUnit, inDefenseRange, canAttack, inVisibleRange, parkedAt, hitDirect, hitIndirect, underAttackBy, + legacy `underFire`
- **IF Sensing:** distance, enemyVisible, enemyInFireRange, myUnitsInEnemyRange, + legacy `enemyInRange` (and the legacy field `enemyDistance`)
- **DO Combat:** attackNearestEnemy, autoAttackInRange, aimNearestEnemy, fireAtLocked, fireForward, turretLeft, turretRight, protectNearestFriendly
- **DO Movement:** hold, retreat, moveForward, moveBackward, moveLeft, moveRight, turnLeft, turnRight
- **DO Air:** takeoff, land
- **DO Service and support:** requestRefill (ammo/health/fuel), goToWorkshop, goToHospital, goToAmmoFactory, serviceNearestFriendly

**control base defence (`defence`)**
- **IF Own unit:** hp, ammo, reload, turretRotation, attacking, + `always`
- **IF World:** money, power, buildingCount, onFire, canAttack (kind = unit only), + `underFire`
- **IF Sensing:** distance (kind = unit only), enemyVisible, enemyInFireRange, + `enemyInRange`
- **DO Combat** (the **only** DO group): holdFire, resumeFire, autoAttackInRange, aimNearestEnemy, fireAtLocked, fireForward, turretLeft, turretRight

**build base (`build`)**
- **IF My base:** money, moneyPerMinute, power, unitCount, buildingCount, burningBuildingCount
- **IF Visible enemies:** enemyUnitCount, enemyBuildingCount
- **IF `always`**, shown alone under an "Own unit" group
- **DO Base construction** (the **only** action): `buildBuilding` with the param `buildingType` ∈ powerPlant, oreRefinery, vehicleFactory, fireDepartment, vehicleWorkshop, constructionYard, radarStation, hospital, gasStation, ammunitionFactory, helipad, airstrip, turretGunV1, turretGunV2, turretGunV3, rocketTurret, teslaCoil, artilleryTurret, concreteWall

**build unit (`unitBuild`)**
- **IF My base:** money, moneyPerMinute, power, unitCount, buildingCount, burningBuildingCount
- **IF Visible enemies:** enemyUnitCount, enemyBuildingCount
- **IF `ownUnitDestroyed`** ("My unit was destroyed"). Its metadata says `buildGroup: 'base'`, but `conditionRows.js:44` sets `buildGroup: meta.group` for checks, so the **editor shows it alone under "World"**. This is a small inconsistency to fix as part of this work.
- **IF `always`**
- **DO Unit production** (the **only** action): `buildUnits` with these params:
  - `unitType`, 25 types: tank, tank-v2, tank-v3, lightTank, rocketTank, howitzer, harvester, fireEngine, ambulance, tankerTruck, ammunitionTruck, recoveryTank, mineLayer, mineSweeper, apache, f22Raptor, f35, destroyer, battleship, submarine, aircraftCarrier, supplyShip, hovercraft, vehicleFerry, navalMineLayer
  - `quantity`, 1–20
  - `delivery` ∈ factoryRally, attackNearest, attackHarvester, attackBase, defendHarvester, defendBase

**Design consequence:** only `unit` has several DO groups. For `defence`, `build` and `unitBuild`, the DO branch has to gate **single actions or param options** (building types, unit types, delivery orders) instead of whole groups.

**Enabling, opt-ins and authoring** (`src/policies/policyStore.js`):
- `setPolicyEnabled` for global scope.
- `applyPolicyToUnit` and `applyPolicyToBuilding` for per-unit and defence bindings.
- The per-owner opt-ins `setBuildAutomationOptIn` and `setUnitBuildAutomationOptIn`. These are the "Base automation" and "Unit build automation" switches in `policyPanel.js`.
- `setAutomationAuthoringGuard(fn)`, a single guard hook already used to block authoring in replays (`gameCommandSync.js:155`).
- Every mutation goes through `subscribeAutomationMutations`. It is broadcast as `COMMAND_TYPES.AUTOMATION_EDIT`, validated by the host and recorded in replays as `automation-edit`.

**Entry points:**
- `#policiesBtn` opens `policyPanel.js`. It has sections for Unit, Defence, Unit build and Base automations, plus an "Add automation to" select with the 4 variants.
- `policyEditorModal.js` holds the button editor, with an `<optgroup>` per group. The CFBL text view is `cfblEditor.js`, backed by `automation/cfbl/completion.js` and `validation.js`.
- `unitPolicyRadial.js`.
- The map action "applyAutomationOnArrival".
- The **Automations** sidebar accordion (`index.html:782`, `automationSidebar.js`) has Export all, Export checked and Import .cfbl, plus an "On" checkbox per automation.

**.cfbl import/export:** `src/automation/automationFiles.js` (`serializeAutomationFile`, `importAutomationFile` with a REPLACE/KEEP/CANCEL prompt on name conflicts).

**Persistence:** automation documents live in a **library in localStorage that carries across matches** (`cfb-automations-v2`). Saves and snapshots also carry `exportAutomationSession(...)`: the records, the enabled set, the opt-ins and the bindings. Automations therefore survive between matches while perks are per match, so locked library entries must be shown as locked, never deleted.

### 3.4 Save, multiplayer, replay, AI

- **Save:** `src/saveGame.js` exports around line 880 and loads around line 1729. The schema is `GAME_STATE_SCHEMA_VERSION = 8` (`src/gameStateSchema.js`), with migrations in `src/gameStateMigrations.js`. Perk state needs a bump to 9 and a migration.
- **Multiplayer:**
  - Commands are host-authoritative (`src/network/gameCommandSync.js`). The host rejects commands from AI-controlled parties.
  - `stateSync.js` snapshots include the automation session.
  - `stateHash.js` includes `getAutomationBehaviorHash()`.
  - Lockstep runs through `lockstepSync.js`.
- **Replay:** commands are recorded with `recordReplayCommand({ type, payload })`.
- **AI:** AI parties never write automations.

### 3.5 UI building blocks

- **Blur overlays:** `backdrop-filter: blur(…)` is used in several places (`styles/modals.css`; `notificationHistory.css` with the `-webkit-` prefix).
  - `attachAutomationViewport(backdrop, dialog)` in `src/ui/policies/automationViewport.js` already handles a full-screen modal: inert siblings, a focus trap, body scroll lock, sizing from visualViewport, and phone/tablet/desktop classification.
  - **Reuse it for the perk overlay.**
- **Map scroll mechanism:**
  - Desktop right-drag in `handleRightDragScrolling` (`src/input/mouseRightClick.js`), at speed ×2 (×1.4 in mobile landscape).
  - Inertia via `gameState.dragVelocity`, with `INERTIA_DECAY = 0.983` and `INERTIA_STOP_THRESHOLD = 1` (`config.js:800`).
  - Wheel/trackpad pan in `src/input/mapPanning.js`.
  - Two-finger pan and long-press drag on touch in `src/input/mouseTouch.js`.
  - The `INVERT_TOUCH_MAP_SCROLL` setting is respected.

  All of it is hard-wired to `gameState.scrollOffset`. Rather than copy it, **extract** a reusable `createPanSurface(element, { onPan, invert, inertia })` that uses the same constants.
- **Tooltips:** `src/ui/policies/policyTooltip.js`, `src/ui/productionTooltip.js`.
- **User manual:** `public/docs/user-documentation.html`, opened through `src/ui/userDocs.js`. It has anchors such as `#tech-tree`, `#buildings` and `#xp`, but **no automation section**. The automation docs live in repo markdown (`docs/automation-tutorial.md`, `docs/cfbl-language-reference.md`), which the landing page links to on GitHub. Perk links need **new manual sections**.
- **UI styleguide** (AGENTS.md): "Never use shadows on buttons in any UI state." Perk nodes are buttons, so their glows must use rings, borders, gradients or SVG strokes, never `box-shadow`.
- **iOS:** the recent iPhone 13 Pro Max fixes dealt with the total canvas memory limit. Build the tree in **DOM/SVG, not a canvas**, and keep badge images small (256 px).

### 3.6 Repo rules that apply (AGENTS.md)

- **Tests and lint:**
  - Rule 1: run the unit tests.
  - Rules 2 and 20: run lint.
- **Notes and history:**
  - Rule 3: add a `docs/changes/` note and a new spec file.
  - Rules 4, 15 and 19: add a prompt-history entry in English, with the exact model, tokens and time.
- **Assets:**
  - Rule 5: building image folders.
  - Rule 17: WebP q85 for all new binaries.
  - Rule 18: prepared rendering tiers before play.
  - Rule 22: a sound-effect prompt mapping for each new sound, plus an audio catalogue entry.
- **Performance:**
  - Rule 12: the hot-loop gate. Compute the perks an automation needs once per compiled program, never per tick.
  - Rule 13: avoid canvas overdraw; the overlay is DOM.
- **Release notes:** a `features/unreleased/features/<date>-command-center-perks.json` entry, likely `"breaking": true`.
- **Test IDs:** run `npm run test:ids:assign`.
- **Commits:** conventional commits with the trailer `Live-Update: breaking (new perk state, schema 9)`.

---

## 4. Perk tree (final)

Conventions:
- Perk ids follow the pattern `cc.<branch>.<slot>`.
- **Auto** means the perk comes free with its start perk (R4.5).
- Inside one IF or DO branch, perks unlock **in order**: each needs the previous one.
- The IF and DO branches don't depend on each other.

Branch colours: base build **amber**, unit build **green**, unit control **cyan**, base defence **red**.

### 4.1 Unit control (`unit`): start 5★

| Id | Name | Branch | Requires | Cost | Unlocks (exact code ids) |
|---|---|---|---|---|---|
| `cc.unit.start` | Unit Command Link | start | CC alive | **5** | `unit` variant (control unit), Unit automations section, applying to units |
| `cc.unit.if.own` | Self Diagnostics | IF 1 | start | Auto | group **Own unit**: hp, xp, rank, fuel, ammo, reload, crew, load, rotation, turretRotation, airborne, moving, attacking, serving, always |
| `cc.unit.if.world` | Battlefield Awareness | IF 2 | if.own | 2 | group **World**: money, power, buildingCount, onFire, underService, underServiceByUnit, inServiceRange, protectedByUnit, inDefenseRange, canAttack, inVisibleRange, parkedAt, hitDirect, hitIndirect, underAttackBy, underFire |
| `cc.unit.if.sensing` | Threat Sensors | IF 3 | if.world | 3 | group **Sensing**: distance, enemyVisible, enemyInFireRange, myUnitsInEnemyRange, enemyInRange, enemyDistance |
| `cc.unit.do.service` | Logistics Protocols | DO 1 | start | Auto | group **Service and support**: requestRefill, goToWorkshop, goToHospital, goToAmmoFactory, serviceNearestFriendly |
| `cc.unit.do.combat` | Combat Doctrine | DO 2 | do.service | 3 | group **Combat**: attackNearestEnemy, autoAttackInRange, aimNearestEnemy, fireAtLocked, fireForward, turretLeft, turretRight, protectNearestFriendly |
| `cc.unit.do.movement` | Maneuver Drills | DO 3 | do.combat | 2 | group **Movement**: hold, retreat, moveForward, moveBackward, moveLeft, moveRight, turnLeft, turnRight |
| `cc.unit.do.air` | Flight Control | DO 4 | do.movement | 1 | group **Air**: takeoff, land |

- Total: **16★**.
- The order follows Patrick's list.
- A starter combo works right after the start perk: "if fuel < 20% → go to workshop / request refill".

### 4.2 Base defence (`defence`): start 2★

Defence has only one DO group (Combat), so this branch gates single actions.

| Id | Name | Branch | Requires | Cost | Unlocks |
|---|---|---|---|---|---|
| `cc.def.start` | Defence Grid Uplink | start | CC alive | **2** | `defence` variant, applying to turrets |
| `cc.def.if.sensing` | Perimeter Sensors | IF 1 | start | Auto | **Sensing**: distance, enemyVisible, enemyInFireRange, enemyInRange, enemyDistance |
| `cc.def.if.own` | Turret Telemetry | IF 2 | if.sensing | 1 | **Own unit**: hp, ammo, reload, turretRotation, attacking, always |
| `cc.def.if.world` | Grid Status | IF 3 | if.own | 1 | **World**: money, power, buildingCount, onFire, canAttack, underFire |
| `cc.def.do.discipline` | Fire Discipline | DO 1 | start | Auto | holdFire, resumeFire |
| `cc.def.do.engage` | Engagement Rules | DO 2 | do.discipline | 1 | autoAttackInRange |
| `cc.def.do.lock` | Target Lock | DO 3 | do.engage | 2 | aimNearestEnemy, fireAtLocked |
| `cc.def.do.manual` | Manual Gunnery | DO 4 | do.lock | 2 | turretLeft, turretRight, fireForward |

| `cc.def.capstone` | **Turret Veterancy** | capstone | **any one of** the 8 lane-end perks: `cc.unit.if.sensing`, `cc.unit.do.air`, `cc.def.if.world`, `cc.def.do.manual`, `cc.base.if.enemies`, `cc.base.do.defence`, `cc.prod.if.enemies`, `cc.prod.do.naval` (OR) | **5** | turret and defence-building veterancy (§5.4); building stars count toward the ledger |

- Total: **9★** for the lanes, **14★** including the capstone.
- **Capstone placement:** the capstone sits at the bottom of the defence column, below its two lanes. Connector lines from the ends of all 8 lanes (every IF and DO lane of all four trees) run into it. A connector lights up when that lane end is owned. The capstone becomes "available" as soon as one connector is lit and the CC is alive.
- "Branch end" means the last perk of an IF lane or a DO lane. This is the most permissive reading of "any of the other branches when these reach their end": the cheapest path is base defence start 2 + Own unit 1 + World 1 + capstone 5 = 9★.
- Sensing comes first on purpose (D7). Sensing plus Hold/Resume fire makes an **ambush** possible right away. Own unit plus Hold fire alone is nearly useless.

### 4.3 Base build (`build`): start 2★

| Id | Name | Branch | Requires | Cost | Unlocks |
|---|---|---|---|---|---|
| `cc.base.start` | Base Planner | start | CC alive | **2** | `build` variant + the "Base automation" opt-in switch |
| `cc.base.if.economy` | Treasury Feed | IF 1 | start | Auto | money, moneyPerMinute, power, always |
| `cc.base.if.census` | Base Census | IF 2 | if.economy | 1 | unitCount, buildingCount, burningBuildingCount |
| `cc.base.if.enemies` | Recon Uplink | IF 3 | if.census | 2 | **Visible enemies**: enemyUnitCount, enemyBuildingCount |
| `cc.base.do.economy` | Economy Blueprints | DO 1 | start | Auto | buildingType: powerPlant, oreRefinery, concreteWall |
| `cc.base.do.support` | Support Blueprints | DO 2 | do.economy | 1 | vehicleWorkshop, fireDepartment, hospital, gasStation, ammunitionFactory, radarStation (+ commandCenter if added) |
| `cc.base.do.production` | Production Blueprints | DO 3 | do.support | 2 | vehicleFactory, helipad, airstrip, constructionYard |
| `cc.base.do.defence` | Fortification Blueprints | DO 4 | do.production | 3 | turretGunV1, turretGunV2, turretGunV3, rocketTurret, teslaCoil, artilleryTurret |

- Total: **11★**.
- Starter combo: "while power < 0 → build power plant".
- Simpler alternative: gate the whole "My base" group (Auto) plus "Visible enemies" (2★).

### 4.4 Unit build (`unitBuild`): start 3★

| Id | Name | Branch | Requires | Cost | Unlocks |
|---|---|---|---|---|---|
| `cc.prod.start` | Production Scheduler | start | CC alive | **3** | `unitBuild` variant + the "Unit build automation" opt-in switch |
| `cc.prod.if.economy` | Treasury Feed | IF 1 | start | Auto | money, moneyPerMinute, power, always |
| `cc.prod.if.census` | Force Census | IF 2 | if.economy | 1 | unitCount, buildingCount, burningBuildingCount |
| `cc.prod.if.losses` | Casualty Reports | IF 3 | if.census | 2 | ownUnitDestroyed (and fix its editor group to "My base") |
| `cc.prod.if.enemies` | Recon Uplink | IF 4 | if.losses | 2 | enemyUnitCount, enemyBuildingCount |
| `cc.prod.do.ground` | Armour Line | DO 1 | start | Auto | unitType: tank, tank-v2, tank-v3, lightTank, rocketTank, howitzer, harvester; delivery: factoryRally |
| `cc.prod.do.support` | Support Fleet | DO 2 | do.ground | 1 | fireEngine, ambulance, tankerTruck, ammunitionTruck, recoveryTank, mineLayer, mineSweeper |
| `cc.prod.do.orders` | Deployment Orders | DO 3 | do.support | 2 | delivery: attackNearest, attackHarvester, attackBase, defendHarvester, defendBase |
| `cc.prod.do.air` | Air Wing | DO 4 | do.orders | 2 | apache, f22Raptor, f35 |
| `cc.prod.do.naval` | Naval Yard | DO 5 | do.air | 2 | destroyer, battleship, submarine, aircraftCarrier, supplyShip, hovercraft, vehicleFerry, navalMineLayer |

- Total: **15★**.
- Perks never bypass the normal tech tree. For example, Tank V3 still needs 2 vehicle factories.

### 4.5 Totals and rules

- There are **35 perks**: 4 start perks, 30 lane follow-ups (8 of them free with their start perk) and 1 capstone.
- The full tree costs **56★** (16 + 9 + 11 + 15 + capstone 5).
- One badge per perk, so **35 badges**.
- `PERK_COST_MULTIPLIER` in `config.js` (registered in `configRegistry.js`) scales all costs.

Rules:
1. **Auto-unlock:** buying `*.start` atomically grants `*.if.<first>` and `*.do.<first>` at cost 0. They show as owned, with an "included" label in place of a price.
2. **Purchasable when:** the predecessor in the same branch is owned (for the capstone: any one of its OR prerequisites), the CC is alive and `available ≥ cost`. The catalog supports `requires: { all: [...] }` and `requires: { any: [...] }`.
3. **Never gated:** `not`/`and`/`or`, states, IF/ELSE/WHILE/AFTER, delays and `waitForCompletion`. Only condition leaves and actions/options are gated.
4. **Drift guard:** a unit test asserts that every `NUMERIC_FIELDS`, `CHECKS`, legacy atom, `EFFECTS` entry and gated option value maps to **exactly one** perk per variant.

---

## 5. Stars ledger and XP rules

### 5.1 Ledger

```js
gameState.perks = { player1: { earned: 0, spent: 0, owned: ['cc.unit.start', …], log: [{ tick, perkId, cost }] } }
// available = earned - spent (derived)
```

- **Earning:** every path that raises a level calls `grantStars(entity, count)`:
  - the shared level-up loop (§5.2) for combat units, used by bullet kills, explosion kills (`logic.js:201`), cheats and debug helpers;
  - the harvester unload loop.
- **What counts:**
  - Every star of every **unit** of the owner, harvesters included, from match start (D3).
  - Bonus stars from §5.3.
  - Cheat stars. Add a `stars <n>` cheat for testing.
  - **Defence buildings** count only after their owner owns `cc.def.capstone` (§5.4). Before that, they earn nothing at all.
- **Never decreases:** unit or building death, selling and losing the CC don't change `earned`. `spent` only goes up (no respec in v1).
- **Purchase:** a new `COMMAND_TYPES.PERK_PURCHASE` with payload `{ actorId, perkId, expectedCost }`.
  - It is validated by a pure `canPurchasePerk(state, owner, perkId)` covering CC alive, prerequisites (`all`/`any`), cost and ownership.
  - The host and lockstep both validate it, and it is recorded in replays.
- **Display:**
  - The overlay footer reads "★ 23 earned · 11 used · **12 available**".
  - A star chip near the money display pulses when something is affordable.

### 5.2 Kill XP (fixes the building-kill bug, D10)

Introduce `getKillValue(target)` in `src/utils.js` and use it in `awardExperience`:

| Target | Kill value |
|---|---|
| unit | `UNIT_COSTS[type]` (unchanged) |
| building | `buildingData[type].cost` (concrete wall 100, street 10, Tesla 5000, CY 5000, …) |
| unknown type | **0**, plus one `window.logger.warn` per type. The `9999999` fallback is no longer used for XP. |

- `xp = round(killValue × XP_MULTIPLIER × factor)`:
  - `XP_MULTIPLIER = 3`, as today.
  - `factor = 1` for units.
  - `factor = BUILDING_KILL_XP_FACTOR = 1.0` for buildings, a new config value registered in `configRegistry.js`.

  This is the same formula as unit kills, so a building is worth what it cost, just like a unit.
- Examples for a Tank V1 (star 1 at 2000 XP):

  | Kill | XP | Result |
  |---|---|---|
  | Concrete wall | 300 | 15% of the way to star 1 |
  | Power plant | 6000 | a full star (see the loop below) |
  | Construction Yard | 15000 | several stars, capped at 3 |

- **Level-up loop (changed):** `checkLevelUp` becomes `applyLevelUps(entity)`. It loops `while (level < 3 && experience ≥ required(level))`, subtracting each threshold and carrying the overflow, the same way the harvester loop already does. At 3 stars, `experience = 0`. Every star gained calls `applyLevelBonuses` and `grantStars`.
  - Today the code raises one level per award and throws the overflow away. Without the loop, large building awards and the §5.3 bonus would be silently lost.

### 5.3 Kill bonus for starred victims (D11)

The bonus applies when the victim (a unit, or a veteran defence building per §5.4) has `level L ≥ 1`, the killer can earn XP (not a harvester; a building only with the capstone), and the owners differ.

1. Apply the normal kill XP and run `applyLevelUps` (§5.2).
2. `bonusStars = 0.5 × L`, so 0.5, 1.0 or 1.5.
3. Convert the bonus to XP **on the killer's own ladder**, one star or part of a star at a time:
   ```js
   let remaining = 0.5 * victim.level
   while (remaining > 0 && killer.level < 3) {
     const step = getExperienceRequiredForLevel(killer.level, killer.baseCost) // 2×/4×/6× own cost
     const portion = Math.min(remaining, 1)
     killer.experience += Math.round(portion * step)
     remaining -= portion
     applyLevelUps(killer)
   }
   // anything left when the killer reaches 3 stars is discarded
   ```
4. **How fractions work:** half a star adds 50% of the killer's **current** next-star requirement. Partial XP the killer already had is kept, so a half-star bonus can complete a star. All arithmetic is integer (`Math.round`), so the result is deterministic.
5. **Cap:** the killer never goes above 3 stars. The bonus alone can add at most 1.5 stars' worth.
6. Bonus stars go to the ledger like any other star.
7. **Why the killer's own ladder?** Patrick asked for "50% of the stars" of the victim, not 50% of its XP. Measuring the bonus in stars on the killer's ladder makes a 3★ victim worth +1.5★ to any killer, cheap or expensive. A pure XP value (victim XP × 0.5) would make a 3★ battleship give a light tank three instant stars.

Example: a Tank V1 with 1 star and 1000 of the 4000 XP it needs for star 2 kills a 2★ Tank V1.
- Normal XP: +3000, giving 4000/4000, so it reaches star 2 with 0 left over.
- Bonus: 1.0 star, which at the star-3 step is 6000 XP, so it reaches **star 3**.

### 5.4 Turret veterancy (D13, gated by `cc.def.capstone`)

- **Before the owner has the capstone:** defence buildings (`DEFENSE_BUILDING_TYPES`: turretGunV1/V2/V3, rocketTurret, teslaCoil, artilleryTurret) **earn no XP at all**. `awardExperience` returns early for buildings. They show no stars and add nothing to the ledger.
  - This is the decided behaviour. It replaces today's invisible levels and avoids a sudden retroactive surge at unlock.
  - In "All unlocked" mode (sandbox, legacy saves) the capstone counts as owned.
- **After the unlock:** all of the owner's defence buildings, existing and new, start earning from 0 XP. The thresholds match units: 2×, 4× and 6× of `buildingData[type].cost` as `baseCost`.
- **Veterancy bonuses** reuse the tank values from `applyLevelBonuses` (L1 range ×1.2, L2 armor ×1.5, L3 self-repair 1% HP every 3 s plus fire rate ×1.33), reordered for turrets to match Patrick's list:

  | Star | Turret bonus | Code field |
  |---|---|---|
  | ★ | +20% fire range | `rangeMultiplier ×= 1.2`, applied wherever `fireRange` is read |
  | ★★ | +33% fire rate | `fireRateMultiplier ×= 1.33`, so `fireCooldown / fireRateMultiplier` |
  | ★★★ | Auto repair: 1% max HP every 3 s of **simulation time**, paused while the building is burning, plus armor ×1.5 | `selfRepair = true`, `armor ×= 1.5` |

  - Tesla coil and artillery turret apply the same multipliers to their own range and cooldown fields.
  - Bonuses are applied once per star gained (idempotent, no per-tick work).
- **Rendering:** the same five-point gold star path as `renderLevelStars`, drawn centred over the building's health bar for defence buildings with `level > 0`, with the same visibility rules as unit stars. An XP progress bar appears when the building is selected.
  - Extract a shared `drawLevelStars(ctx, x, y, count)` helper so units and buildings stay identical.
  - Building stars must not allocate per frame and must skip buildings with level 0 (rule 12).
- **Kill bonus:** a veteran turret that dies gives its killer the §5.3 bonus.
- **Ledger:** once the capstone is owned, turret stars go into `earned`.
- **Persistence:** `building.level`, `experience`, `baseCost` and the bonus multipliers are saved, loaded, snapshotted and hashed.
- **Automation (optional, later):** offer `rank` and `xp` conditions in the `defence` variant under "Own unit" (Turret Telemetry).

---

## 6. Command Center building (decided)

| Field | Value | Reasoning |
|---|---|---|
| type | `commandCenter` | |
| displayName | Command Center | |
| size | 3 × 3 | R2 |
| cost | **3500** | between Workshop (3000) and Hospital (4000) |
| power | **−100** | above Radar (−50), below Refinery (−150) |
| health / armor | **400** / 2 | high-value target; CY has 350 HP |
| build time | ~5.25 s × multipliers | `getProductionDuration(3500, true)` |
| requires | normal chain + **`requiresRadar: true`** | R1; add to the Radar rule's `buildings` list |
| limit | **1 per player** (D6) | |
| selection action | **Open Perk Tree**, hotkey `K` (configurable) | |
| optional | `commandCenterBuilt` milestone video (HEVC hvc1 960×576 with audio) | later |

**When the CC is destroyed (D5)**

Decided: owned perks are **kept**. While the player has no living CC, purchases are blocked and **all of that owner's automations are suspended**. Their bindings and opt-ins stay recorded, and the UI says "Command link lost: rebuild the Command Center". Authoring with owned perks stays allowed, and everything resumes once a CC is rebuilt. Low power doesn't affect anything (keep it simple).

Alternatives:
- Perks are lost on destruction (harsh).
- The CC is needed only for buying.
- A random perk gets "damaged" until the CC is repaired (complex).

---

## 7. Gating in the automation UI and runtime

Single source of truth:
- `src/perks/perkCatalog.js` (data)
- `src/perks/perkState.js` with `ownsPerk`, `isItemUnlocked(owner, variant, kind, id, option?)` and `subscribePerks`

| Surface | When locked |
|---|---|
| "Add automation to" select | Variant is disabled, labelled e.g. "🔒 control unit: needs Unit Command Link (5★)" |
| Panel sections / cards | Lock banner with an "Open Perk Tree" button; cards show a lock badge and "Locked: needs …" |
| Button editor | Locked `<optgroup>`s/options stay visible but `disabled`, with 🔒 and a tooltip naming the perk and cost. Locked values in `buildingType`/`unitType`/`delivery` are disabled the same way |
| CFBL editor | Completion greys locked items and sorts them last; `validation.js` adds a `perk-locked` diagnostic |
| Saving | Allowed; the automation stays a draft in the library |
| Enable / apply / opt-ins / map-action apply | The store refuses, and the controls are disabled with a tooltip |
| Sidebar "On" checkbox | Disabled with a lock; export always works |
| .cfbl import | Always imports; the notification lists the locked items |
| Runtime | `policyCompiler` caches `requiredPerks` per program. The engine checks one boolean per binding, refreshed only on perk or CC events (rule 12). Automations that become locked are **suspended, not deleted** |
| Host | Re-checks perks on `AUTOMATION_EDIT` enable/apply |

**Escape hatches (D14):**
- A game setting **"Automation perks: Required | All unlocked (sandbox)"**.
  - The host decides in multiplayer.
  - The map editor, benchmark and existing automation tests use "All unlocked".
- Saves from before schema 9 migrate to All unlocked.
- Automations from earlier matches stay in the localStorage library and show as locked.

---

## 8. Perk Tree overlay

- **Shell:**
  - A backdrop with `rgba(6,10,18,0.35)` and `backdrop-filter`/`-webkit-backdrop-filter: blur(10px) saturate(1.2)`, mounted via `attachAutomationViewport`.
  - Esc or × closes it.
  - On phones, fall back to less blur if it measures slow.
- **While open (D9):** single-player pauses; multiplayer keeps running. The map render loop may throttle while it is covered.
- **Layout ("upside down"):**
  - The 4 start perks form the top row.
  - Each splits downward into an IF lane (left, hex-rim badges) and a DO lane (right, chevron-rim badges), joined by SVG connectors.
  - The tree is about 1800×1600 CSS px and is panned, not scaled.
  - The gold **Turret Veterancy** capstone sits at the bottom centre. Merge connectors run into it from the ends of all 8 lanes, and each connector lights up once its lane end is owned.
- **Footer:** Earned · Used · Available in gold SVG stars, plus a hint on how to earn stars.
- **Node:** a `<button>` with the badge (96 px desktop, 72 px phone), the name, and N SVG stars (#FFD700/#FFA500, about 16 px). States:
  - **locked:** grayscale, 45% opacity, gray stars, padlock
  - **unaffordable:** colour at 70%, the missing stars tinted red
  - **available:** animated conic-gradient ring in the branch colour (no box-shadow)
  - **owned:** gold stars, shimmer, lit connectors

  `prefers-reduced-motion` is respected.
- **Tooltip** (hover/focus on desktop; first tap opens a bottom sheet with a Buy button on phones). It shows:
  - name, cost and state
  - the exact items it unlocks, generated from the catalog
  - a one-line CFBL usage example
  - the prerequisite
  - a "Manual →" link to `/docs/user-documentation.html#perk-<id>`
- **Buying:** an inline confirm ("Unlock Threat Sensors for 3★? 12★ → 9★") sends `PERK_PURCHASE`. Success flips the badge, lights the connectors and plays an optional unlock SFX.
- **Panning:** uses the extracted `createPanSurface`.
  - Left/right drag on empty space, wheel/trackpad, and one- or two-finger touch.
  - Same speeds, inertia (0.983 / 1) and invert setting as the map.
  - Arrow keys and WASD also pan.
  - Optional zoom from 0.6 to 1.4.
- **Entry points:**
  - the CC action and the `K` hotkey
  - the star chip, view-only without a CC
  - the automation panel's lock banners

---

## 9. Assets (final, committed)

All assets are WebP q85 (AGENTS rule 17). Provenance and prompts are in `docs/asset-sources/command-center-art-prompts.md`. The generated sources are in `docs/asset-sources/command-center/`. `python3 docs/asset-sources/command-center-build.py` rebuilds every asset below from those sources.

| Asset | Path | Format |
|---|---|---|
| Command Center map sprite (variant 2: radar dome and two dishes) | `public/images/map/buildings/command_center.webp` | 384×384 RGBA, the 3×3 footprint at 128 px/tile, like the Fire Department |
| Build button | `public/images/sidebar/command_center.webp` | 256×256 opaque RGB, the desert hero shot used by the other buttons |
| 35 perk badges | `public/images/perks/<perk-id>.webp`, e.g. `public/images/perks/cc.def.capstone.webp` | 256×256 RGBA, circular alpha (start perks keep their hex crest) |

- The prepared tiers are not generated yet. When `commandCenter` is added to `buildingData`, also add `['commandCenter', 'command_center.webp', 3, 3]` to `scripts/build-prepared-sprites.mjs` and regenerate (sizes 96/192/288).
- `smokeSpots` are optional. If wanted, place them on the radar-dome tower at roughly `{ x: 190, y: 40 }` in 384 px source pixels.
- The locked badge style is done in CSS (grayscale plus a padlock SVG). No extra art is needed.
- Optional: unlock and open sound effects (`eleven_text_to_sound_v3`, with entries in `sound-effects-prompts.json` and the audio catalogue).

---

## 10. Save / multiplayer / replay / AI

- **Save:**
  - `perks` and `automationPerkMode` are saved and loaded.
  - The schema goes from 8 to 9. The migration sets All unlocked and seeds `earned` from the levels of living units.
  - Commit trailer: `Live-Update: breaking`.
- **Multiplayer:**
  - Purchases are a host-validated command applied at the lockstep tick.
  - Earning happens in the simulation and is deterministic.
  - Perk state goes into the snapshot and `stateHash` (sorted owned ids, earned and spent per owner).
  - Opponents' perks are hidden in v1.
- **Building veterancy** (`level`, `experience`, multipliers) is saved, snapshotted and included in the state hash.
- **Replay:** `perk-purchase` commands are replayed. Live purchases are blocked during replay.
- **AI (v1):**
  - Stars are tracked for AI players.
  - The AI doesn't buy perks or build CCs.
  - Add `commandCenter` to `ai-api/techTree.js` and `llmStrategicDigest.js`.

---

## 11. Test plan

**Unit tests** (Vitest; write them without IDs, then run `npm run test:ids:assign`):

1. **Ledger**
   - These add to `earned`: combat stars, harvester stars, multi-star loops, bonus stars, and cheat stars.
   - Defence-building stars add nothing before the capstone and count after it.
   - Death changes nothing, and `available = earned − spent`.
2. **Building-kill XP**
   - XP equals `cost × 3 × BUILDING_KILL_XP_FACTOR`. A concrete wall gives 300 XP.
   - An unknown type gives 0 XP and logs one warning.
   - The level-up loop carries overflow, caps at 3 stars, and resets XP at 3 stars.
3. **Kill bonus**
   - Victims at 0, 1, 2 and 3 stars.
   - Half-star fractions on a partly filled ladder, including the worked example in §5.3.
   - Cap at 3 stars, with the remainder discarded.
   - No bonus for friendly kills or harvester killers.
   - Turret victims and turret killers, with and without the capstone.
   - Results are deterministic integers.
4. **Turret veterancy**
   - Bonuses applied per star: range ×1.2, fire rate ×1.33, then self-repair with armor ×1.5.
   - Repair runs on simulation time and pauses while the building burns.
   - No per-frame allocation in star rendering.
   - Save, load and hash round-trip.
5. **Purchase**
   - Rejected: no CC, a missing prerequisite, too few stars, already owned, wrong actor.
   - The auto-grant is free.
   - The capstone can be bought after any one of the 8 lane ends, and not before.
6. **Catalog**
   - Completeness: every condition, legacy atom, effect and gated option maps to exactly one perk.
   - Costs: starts 2/3/5/2, follow-ups 1–3, capstone 5.
   - 35 perks, totalling 56★.
   - Every perk id has a badge file.
7. **Gating**
   - Disabled optgroups and options in the editor.
   - CFBL completion and the `perk-locked` diagnostic.
   - The store refuses locked automations; import reports them.
   - `requiredPerks` is cached per program.
   - Automations suspend and resume around CC loss and rebuild.
8. **Building**
   - The CC is locked before Radar and unlocked after it, limited to 1 per player.
   - Manifest and image-map entries exist.
9. **Persistence**
   - Save round-trip and the 8 → 9 migration.
   - Snapshot and state hash include perks and building veterancy.
   - Replay of `perk-purchase` commands; the host rejects invalid purchases.
10. **Fixes**
    - The editor group for `ownUnitDestroyed`.
    - The manual's XP section mentions harvester stars and turret veterancy (string check on the HTML).

**E2E tests** (Playwright):

- Radar → CC → Perk Tree → cheat stars → buy Unit Command Link → write an automation → Combat is locked → buy it → Combat is unlocked.
- Complete one lane → the capstone becomes available → buy it → a turret kill shows a star and the ledger goes up.
- Pan the tree with mouse drag and wheel on desktop, and with touch in an iPhone-sized viewport.
- Destroy the CC → automations are suspended → rebuild → they resume.
- Existing automation specs use the "All unlocked" fixture.

**Manual check:** run it on Patrick's iPhone 13 Pro Max and check overlay blur cost and memory.

---

## 12. Implementation: three Codex tasks

Patrick asked (t622u, t623u) for at most three Codex Cloud tasks using GPT-6.2-sol. Two or three may run in parallel, with minimal overlap between their files. They fit together through the shared interfaces in §15. Grok Bot applies each diff onto the latest `origin/dev`, resolves conflicts, runs lint, unit tests and the build, and pushes to `dev`.

| Task | Scope | Owns (primary files) | Runs |
|---|---|---|---|
| **A: XP and veterancy** | §5.2 building-kill XP and the level-up loop; §5.3 kill bonus; harvester parity; `stars` cheat; §5.4 turret veterancy logic, bonuses, self-repair, rendering of building stars (shared `drawLevelStars`); persistence of building veterancy fields; fix the manual's `#xp` section | `src/utils.js`, `src/game/veterancy.js` (new), `src/game/bulletSystem.js`, `src/logic.js`, `src/game/harvesterLogic.js`, `src/input/cheatSystem.js`, the XP constants in `src/config.js`, `src/rendering/unitRenderer.js`, `src/rendering/buildingRenderer.js`, the turret combat code in `src/game/buildingSystem.js`, the building fields in `src/saveGame.js`, `public/docs/user-documentation.html#xp` | in parallel with B |
| **B: Command Center, perk state and gating** | §6 CC building (data, Radar unlock, limit 1, sidebar button, image map, prepared tiers, tooltip, AI-API/LLM digest, `BUILDING_TYPES`/`BUILDABLE_TYPES`); §4 `perkCatalog.js`; §5.1 `perkState.js` ledger and `PERK_PURCHASE`; schema 9 save/migration, snapshot, hash and replay; wiring of A's veterancy hooks; §7 gating in store, compiler, engine, editor, CFBL, sidebar, import and map actions; `automationPerkMode` setting with a test fixture | `src/perks/*` (new), `src/data/buildingData.js`, `src/production/*`, `index.html` (sidebar button only), `src/buildingImageMap.js`, `scripts/build-prepared-sprites.mjs` + prepared outputs, `src/ai-api/techTree.js`, `src/ai/llmStrategicDigest.js`, `src/network/*`, `src/gameStateSchema.js`, `src/gameStateMigrations.js`, the perk fields in `src/saveGame.js`, `src/policies/*`, `src/ui/policies/*`, `src/automation/*` | in parallel with A |
| **C: Perk Tree UI and docs** | §8 overlay (`createPanSurface` extraction, shell, layout with the capstone merge connectors, nodes with badges, tooltips, purchase flow, star chip, `K` hotkey, CC selection action); user manual sections `#command-center`, `#perks`, `#perk-<id>`, `#turret-veterancy`; automation tutorial and CFBL reference lock notes; landing EN/DE | `src/ui/perks/*` (new), `styles/perks.css` (new), `src/input/panSurface.js` (new) plus a minimal refactor of `mapPanning.js`/`mouseRightClick.js`, the keybinding registration, `public/docs/user-documentation.html` (new sections only), `docs/automation-tutorial.md`, `docs/cfbl-language-reference.md`, `src/landing/*` | after B is on `dev` (it imports B's API) |

Rules for every task:
- Start from the latest `dev`.
- Use conventional commits with a `Live-Update:` trailer.
- Never touch `docs/brainstorm.md`.
- Add the tests §11 lists for your scope, then run `npm run test:ids:assign`.
- Run `npm run lint`, `npm run test:unit` and `npm run build`.
- Add your own `docs/changes/2026-11-21-<slug>.md`, `prompt-history/` entry and `features/unreleased/...` entry.
- Every new image needs WebP q85 and a provenance entry.

---

## 13. Resolved questions

Every open question from the draft was decided as recommended (D1–D9, D14), and Patrick's additions are D10–D13. The assumptions below were made while finalising. They stand unless Patrick objects:

1. **"Branch end" for the capstone** means the last perk of **any one of the 8 IF/DO lanes** (OR prerequisite). The cheapest route is 9★ through base defence.
2. **Building-kill XP factor** is 1.0: a building counts the same as a unit of equal cost. It is configurable through `BUILDING_KILL_XP_FACTOR`.
3. **Level-up overflow now carries over** (a loop up to 3 stars), for all units. Without this, the bonus and building XP would be lost.
4. **The kill bonus is measured in stars on the killer's ladder** (§5.3), not as raw XP.
5. **Turret ★★★ also gets armor ×1.5**, taken from the tank ★★ bonus, alongside auto repair. That gives three tiers like tanks.
6. **Turrets earn nothing before the capstone.** There is no silent or retroactive XP.

---

## 14. Proactive suggestions

- **S1 Catalog drift guard:** a test that forces every new condition or action to belong to a perk.
- **S2 Star chip:** a "perk ready" pulse, plus a one-time notification the first time a perk is affordable.
- **S3 Templates as rewards:** each perk unlocks matching `policyTemplates.js` templates, with a "Try it" button that opens a pre-filled editor.
- **S4 More star sources:** milestones (+1★ each), mission objectives, and optionally a slow ★ trickle from a powered CC.
- **S5 Perks beyond automations:** a 5th branch, "Command doctrines": build speed, repair rate, a radar-scan ability.
- **S6 AI perks:** the LLM AI gets its own stars ledger and buys perks and templates.
- **S7 Mobile layout:** one branch per screen with horizontal swipes, bottom-sheet tooltips and safe-area insets.
- **S8 Respec:** a CC "Reprogram" action with a 50% refund that also costs money; off in competitive multiplayer.
- **S9 Lock-aware sharing:** `.cfbl` exports carry a `requiredPerks` hint.

---

## 15. Shared interfaces (contract between tasks A, B and C)

### 15.1 `src/game/veterancy.js` (task A owns it; B wires the hooks)

```js
export const DEFENCE_VETERANCY_TYPES // ['turretGunV1','turretGunV2','turretGunV3','rocketTurret','teslaCoil','artilleryTurret']
export function setStarGrantListener(fn)        // fn(entity, count): called once per level-up batch; default no-op
export function setTurretVeterancyGate(fn)      // fn(ownerId) -> boolean; default () => false
export function canEarnVeterancy(entity)        // units (not harvesters, which earn via unloads) always; defence buildings only if the gate(owner) is true
export function getKillValue(target)            // §5.2
export function applyLevelUps(entity)           // loop with carry-over; calls applyLevelBonuses + the star listener
export function applyKillBonus(killer, victim)  // §5.3
export function drawLevelStars(ctx, centerX, topY, count, size = 6) // shared star path (#FFD700 / #FFA500)
```

`awardExperience` in `src/utils.js` delegates to these, and the harvester loop calls the star listener.

### 15.2 `src/perks/perkCatalog.js` (task B)

```js
export const CAPSTONE_PERK_ID = 'cc.def.capstone'
export const START_PERK_BY_VARIANT = { unit: 'cc.unit.start', defence: 'cc.def.start', build: 'cc.base.start', unitBuild: 'cc.prod.start' }
export const PERKS // frozen array of 35 entries, in display order:
// { id, name, tree: 'unit'|'def'|'base'|'prod', variant, lane: 'start'|'if'|'do'|'capstone', order, cost,
//   requires: { all: [ids] } | { any: [ids] }, auto: boolean, summary, howTo,
//   unlocks: { conditions: [ids], effects: [ids], options: [{ effect, param, values: [] }] },
//   badge: 'images/perks/<id>.webp', manualAnchor: 'perk-<id>' }
export function getPerk(id)
export function perksForTree(tree)
```

### 15.3 `src/perks/perkState.js` (task B)

```js
export function getPerkLedger(ownerId)        // { earned, spent, available, owned: string[] }
export function ownsPerk(ownerId, perkId)     // true in 'allUnlocked' mode
export function canPurchasePerk(ownerId, perkId) // { ok: boolean, reason?: 'noCommandCenter'|'missingPrerequisite'|'insufficientStars'|'owned'|'unknown' }
export function requestPerkPurchase(perkId)   // local human player: sends PERK_PURCHASE (host/lockstep validated); resolves via subscribePerks
export function hasLivingCommandCenter(ownerId)
export function getAutomationPerkMode()       // 'required' | 'allUnlocked'
export function isItemUnlocked(ownerId, variant, kind /* 'condition'|'effect'|'option' */, id, option)
export function requiredPerksForPolicy(policy) // Set<string>, cached by the compiler
export function subscribePerks(listener)      // returns unsubscribe; fired on earn, purchase, CC change or mode change
export function exportPerkState() / restorePerkState(payload) / resetPerkState() / getPerkStateHash()
```

### 15.4 Task C entry points

- `openPerkTree()` and `closePerkTree()`, exported from `src/ui/perks/perkTree.js`.
- B's Command Center selection action and the automation-panel lock banners call `openPerkTree` through a dynamic import, so B never statically depends on C.

---

## 16. Follow-up after `d052b13e` (2026-11-21)

The original tree, ledger, overlay, and gating landed in `254b6255`, `fcdc77fd`, `db7f3d44`, and the polish commit `d052b13e` (Codex task behind the GB-2 pass). This section is the leftover work so it is not forgotten. It does not reopen D1–D14 unless an item below explicitly changes a shipped behaviour.

**Status:** open follow-up. Do not treat this section as already implemented.

GB-2 items already done and **not** repeated here: 1, 3, 4, 9 (`skills/new-building/SKILL.md` two-stage art flow, also linked from `skills/new-unit/SKILL.md`), and 10. Item 2 is only done for the perk overlay, not for the automation editor. Item 5 has no touch-sequence tests and no recorded iPhone verification.

### 16.1 Current facts on `origin/dev` @ `d052b13e`

- Perk overlay panning uses `createPanSurface` with `inertia: true` (`src/ui/perks/perkTree.js`). The automation editor mounts `attachAutomationViewport` only (`src/ui/policies/policyEditorModal.js`) and does **not** use `createPanSurface`, so inertia / faster editor scrolling is still missing.
- The action bar still has `<button id="commandCenterPerksBtn" … hidden>★ Perks</button>` in `index.html`, shown and wired from `src/ui/moneyBar.js` when a Command Center is selected. The `K` keybinding `open-perk-tree` and the money-bar star chip also open the tree. Patrick's follow-up is to open the perk menu **only** from a small context menu on the Command Center and to **remove** the ★ Perks action-bar button. Whether `K` and the star chip remain is an open question.
- Landing / marketing copy is still one shared paragraph in `src/landing/locales/en.json` and `de.json` (around the feature body and the later `lead`), with **no** perk badge images.
- Badge files already exist at `public/images/perks/*.webp` (35 badges).
- The user manual (`public/docs/user-documentation.html`, section `#perks`) has headings for all 35 perks. **34** of them share the same placeholder sentence: "This command perk unlocks the matching conditions, actions, or option values shown in its in-game tooltip. Normal technology and production requirements still apply." Only the Turret Veterancy capstone (`#perk-cc.def.capstone`) has its own real text. None of the perk headings include badge images.
- Automation UI gating today depends on perks for individual conditions/actions, but the automation **menu** itself is still reachable without a Command Center that owns at least one perk.

### 16.2 User stories

#### User Story F1: Faster automation-editor panning (GB-2 item 2)

**Priority:** P1  
**As a** player editing automations  
**I want** the editor canvas to pan with the same inertia and a quicker feel than a static drag  
**So that** moving around a large policy is as comfortable as panning the perk tree

**Acceptance Criteria:**

- [ ] The automation editor pan surface supports inertia (and a faster/more usable scroll feel) consistent with the shared pan helper, including reduced-motion behaviour already used by `createPanSurface`.
- [ ] The perk overlay keeps the inertia behaviour it already has; this item is about the editor, not about regressing the overlay.

#### User Story F2: Touch and iPhone verification (GB-2 item 5)

**Priority:** P1  
**As a** player on an iPhone  
**I want** opening, panning, and purchasing perks to work reliably on the device  
**So that** the overlay is not desktop-only in practice

**Acceptance Criteria:**

- [ ] Automated touch-sequence tests cover the perk overlay activation / pan / purchase path at the level the repo's test stack allows.
- [ ] The overlay is verified on Patrick's iPhone (13 Pro Max is the recorded target in §11). The result of that check is recorded (pass, fail, or remaining issue).

#### User Story F3: Open perks from the Command Center context menu (GB-2 item 6)

**Priority:** P0  
**As a** player  
**I want** to open the perk tree from a small context menu on the Command Center, and I do not want a ★ Perks button on the action bar  
**So that** perks live on the building instead of occupying the unit action bar

**Acceptance Criteria:**

- [ ] A small context menu on the Command Center includes an action that opens the perk tree.
- [ ] The `★ Perks` action-bar button (`#commandCenterPerksBtn`) is removed from the action bar and from the code that shows or wires it.
- [ ] The context-menu flow works with mouse and with the existing long-press / touch map-action patterns.
- [ ] Whether the `K` hotkey and the star chip still open the tree is decided (see Open questions) and then implemented consistently, including keybinding UI and the manual.

#### User Story F4: Landing-page perk section with badges (GB-2 items 7 and 8)

**Priority:** P1  
**As a** visitor of the marketing landing page  
**I want** a compact Command Center perk section that shows the badge images  
**So that** I can see the automation perk tree is a real feature, not only a paragraph of text

**Acceptance Criteria:**

- [ ] `/en/landing` and `/de/landing` gain a compact perk section (not only the existing single paragraph in `src/landing/locales/en.json` and `de.json`).
- [ ] The section uses the existing badge images at `public/images/perks/*.webp`.
- [ ] English and German copy are both present. Exact layout, which badges are shown (all 35 vs a subset), and wording are still open if Patrick wants to direct them; a compact, non-overwhelming section is the requirement.

#### User Story F5: Hide or lock automations until a perk is owned (GB-2 item 11)

**Priority:** P0  
**As a** player who has not yet started the perk tree  
**I want** the automation menu hidden or locked until I have a Command Center with at least one owned perk  
**So that** automations do not appear as a usable system before the Command Center perk gate is in play

**Acceptance Criteria:**

- [ ] The automation menu is not freely usable until the human player has a living Command Center **and** at least one owned perk. Buying a start perk already auto-owns its first IF and DO, so one start-perk purchase satisfies "at least one owned perk" once that rule remains in force.
- [ ] After the condition is met, the existing perk locks on individual conditions and actions still apply.
- [ ] "All unlocked" mode, multiplayer spectators, and old saves need a decided behaviour (see Open questions) before this ships.
- [ ] If the Command Center is later destroyed, existing decision D5 still applies to running automations; how the menu itself looks in that state should be consistent with D5 and with this item.

#### User Story F6: Real manual text and badges for every perk

**Priority:** P1  
**As a** player reading the user manual  
**I want** each perk to have its own short explanation and badge  
**So that** the manual matches the in-game tooltips instead of repeating one placeholder 34 times

**Acceptance Criteria:**

- [ ] Each of the 34 non-capstone perk entries in `public/docs/user-documentation.html` has its own description, not the shared placeholder sentence. The capstone already has unique text and must not be reduced to the placeholder.
- [ ] Badge images (`public/images/perks/*.webp`) appear with the perk entries.
- [ ] Text stays accurate to the catalog (`src/perks/perkCatalog.js` summaries / how-to). Exact wording can follow the in-game `summary` and `howTo` fields unless Patrick wants a rewrite.

### 16.3 Functional requirements

#### FR-F01: Automation editor inertia
The automation editor uses the shared pan surface (or equivalent behaviour) so inertia and a faster scroll feel exist there, not only on the perk overlay. (GB-2 item 2.)

#### FR-F02: Touch-sequence tests and iPhone check
Add touch-sequence coverage for perk overlay activation and record an iPhone verification pass or remaining issues. (GB-2 item 5.)

#### FR-F03: Context menu entry; remove the action-bar button
The perk tree is opened from a small context menu on the Command Center. Remove the ★ Perks action-bar button. (GB-2 item 6.)

#### FR-F04: Compact landing section with badges
Add a compact perk section with badge images on the EN and DE landing pages. (GB-2 items 7 and 8.)

#### FR-F05: Automation menu gated on CC + one owned perk
Lock or hide the automation menu until a Command Center exists for the player and that player owns at least one perk. (GB-2 item 11.)

#### FR-F06: Manual perk entries
Replace the 34 shared placeholder perk paragraphs in the user manual with unique text, and show badge images. Keep the capstone's unique text.

### 16.4 To-do checklist

- [ ] Item 2 — inertia / faster scrolling on the **automation editor** pan surface.
- [ ] Item 5 — touch-sequence tests and iPhone activation verification, with the result recorded.
- [ ] Item 6 — Command Center context menu opens the perk tree; remove `★ Perks` from the action bar; decide what happens to `K` and the star chip.
- [ ] Items 7 and 8 — compact landing / marketing perk section with badges, EN and DE.
- [ ] Item 11 — lock or hide the automation menu until a Command Center with at least one owned perk exists; decide hide vs lock and All-unlocked behaviour.
- [ ] Manual — unique text + badge images for the 34 placeholder perk entries; do not strip the capstone's real text.

### 16.5 Open questions

1. **Item 2 feel.** How much faster should the editor pan than today? Should it match the perk overlay (`speed: 1.2`, inertia on) exactly, or should the editor use different values?
2. **Item 5 scope.** Which gestures must the automated tests cover (open via the new context menu, pan, pinch if any, purchase confirm, close)? Is a physical iPhone check by Patrick required before this item is closed, or is a simulator plus later manual check enough?
3. **Item 6 and other entry points.** After the action-bar button is removed, should the `K` keybinding and the money-bar star chip still open the tree, or is the Command Center context menu the only opener?
4. **Context-menu shape.** Reuse the existing long-press / right-click unit or building menu, or a smaller CC-only menu? Which label ("Perks", "Automation Perks", something else)?
5. **Landing section layout.** All 35 badges, one badge per start branch, or a compact strip? How much text besides the badges? Any link into the in-game manual?
6. **Item 11 hide vs lock.** Should the automation menu be omitted entirely, or shown disabled with an explanation ("Build a Command Center and buy a perk")?
7. **Item 11 and "All unlocked" mode.** Does that setting bypass the menu gate (because every perk is treated as owned), or does the player still need a Command Center?
8. **Item 11 and destroyed Command Center.** D5 suspends automations and blocks purchases until a CC is rebuilt. Should the menu hide again, stay visible but locked, or stay open on already-owned perks?
9. **Manual tone and length.** Use the catalog `summary` / `howTo` text verbatim, or write shorter/longer manual prose? Any language besides the existing English manual?
10. **Priority / grouping.** Can these leftovers ship in one pass or in several small commits? No sequence was mandated.

### 16.6 Out of scope

- Re-opening the 35-perk catalog, star economy, or capstone rules from §§4–5 unless a leftover item cannot be done otherwise.
- Generating new badge art (the 35 badges are already committed). If a badge must be redone, the 2026-11-21 rule applies: Grok Imagine only, previewed and approved before commit.
