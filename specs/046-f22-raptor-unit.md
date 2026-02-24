# Spec 046: F22 Raptor Stealth Fighter Unit

## Overview
The F22 Raptor is a high-speed stealth fighter aircraft that spawns from the Airstrip building. It uses the same flight model as the Apache helicopter but with much higher speed, altitude, and reduced ammo capacity (air-to-ground missiles).

## Unit Properties
- **Cost**: $5,000
- **Health**: 60 HP
- **Speed**: 9.0 (significantly faster than Apache at 5.0625)
- **Altitude**: maxAltitude = TILE_SIZE * 6 (higher than Apache at 4.5)
- **Ammo**: 6 air-to-ground missiles (maxRocketAmmo)
- **Fuel**: 4000 tank size, 200 consumption (higher rate than Apache)
- **Stealth**: unit.stealth = true (invisible on radar to enemies in future)
- **Color**: `#1C6EA4` (Steel blue)

## Spawning
- Spawns from **Airstrip** building (like Apache from Helipad)
- Airstrip must be owned by the player and operational
- Uses round-robin if multiple airstrips exist

## Tech Tree
- Unlocked automatically when player builds an **Airstrip**
- Airstrip is already unlocked via Radar Station

## Combat
- Uses Apache combat system (rocket volley fire)
- Can target ground and building targets
- Rearms at Airstrip landing pad

## Flight Mechanics
- Uses Apache's `updateApacheFlightState` for altitude/landing/takeoff
- No hover (fixed-wing jet – hoverFuelMultiplier = 1.0)
- Uses flightPlan navigation (same as Apache)
- Landing/refueling/rearming at Airstrip handled in helipadLogic.js
- Landing radius at Airstrip: TILE_SIZE * 3 (larger than helipad due to airstrip size)

## Image Assets
- Sidebar: `public/images/sidebar/f22_raptor_sidebar.webp`
- Map: `public/images/map/units/f22_raptor_map.webp`
- Renderer: `src/rendering/f22ImageRenderer.js`

## AI Support
- Enemy AI produces F22 from airstrips (same priority logic as Apache from helipad)
- Uses `updateApacheAI` for decision making

## Requirements
- [x] Config properties (UNIT_COSTS, UNIT_PROPERTIES, UNIT_TYPE_COLORS, UNIT_AMMO_CAPACITY, UNIT_GAS_PROPERTIES)
- [x] Unit initialization in createUnit (units.js)
- [x] Spawning from airstrip in spawnUnit (units.js) and productionQueue.js
- [x] Tech tree unlock (productionControllerTechTree.js)
- [x] Button requirement check (productionControllerButtonSetup.js)
- [x] F22 image renderer (f22ImageRenderer.js)
- [x] Unit rendering in unitRenderer.js
- [x] Helipad logic for landing/refueling/rearming (helipadLogic.js)
- [x] Helipad availability check updated (helipadUtils.js)
- [x] Movement system support (movementCore.js, movementHelpers.js)
- [x] Combat system (unitCombat.js uses apacheCombat)
- [x] Air commands (airCommands.js)
- [x] Mouse commands for click-to-land (mouseCommands.js, mouseSelection.js)
- [x] Cursor manager (cursorManager.js)
- [x] Enemy AI behavior (enemyUnitBehavior.js, enemyAIPlayer.js)
- [x] LLM strategic controller catalog entry
- [x] Ammunition systems (ammunitionSystem.js, ammunitionTruckLogic.js)
- [x] Bullet collision/tracking (bulletCollision.js, bulletSystem.js)
- [x] Sidebar HTML button (index.html)
- [x] Tooltip display name (productionTooltip.js)
