# Spec 021: F22 Raptor Stealth Fighter Unit

## Overview
Adds the F22 Raptor as a new air unit that spawns from the existing airstrip building.

## Unit Properties
- **Type**: `f22Raptor`
- **Cost**: $8,000
- **Health**: 80 / 80
- **Speed**: 8.0 (fastest unit in the game)
- **Rotation speed**: 0.3
- **Acceleration multiplier**: 1.5
- **Fuel tank**: 8,000 (consumption: 200/tick)
- **Ammo capacity**: 20 rockets
- **Color**: `#1E3A5F` (dark blue / stealth)

## Key Flags
- `isAirUnit: true` — treated as an air unit by all flight systems
- `requiresAirstrip: true` — must land at an airstrip to refuel/rearm
- `radarInvisible: true` — invisible to radar detection
- No crew system (excluded from crew initialization)
- No turret (turret rendering skipped)

## Spawning
- Spawns from `airstrip` building (12×6 tiles)
- Production queue selects airstrips via round-robin (`gameState.nextAirstripIndex`)
- If all airstrips are occupied, forces occupying F22 to take off before spawning
- Starts in `flightState: 'grounded'` with full fuel and ammo

## Tech Tree
- Unlocked when player owns at least one `airstrip` building
- Button disabled with tooltip "Requires Airstrip" if no airstrip exists

## Refueling / Rearming
- Uses `helipadLogic.js` airstrip branch (parallel to helipad/apache logic)
- Landing radius: 4 tiles from airstrip center
- Refuels at rate: `maxGas / 4000` per ms
- Rearmed at rate: `maxRocketAmmo / 10000` per ms
- Auto-takeoff when ammo is full and `autoHelipadReturnActive` is set

## Rendering
- `src/rendering/f22ImageRenderer.js`: loads `images/map/units/f22_raptor_map.webp`
- Renders with altitude lift offset and shadow ellipse
- Sidebar image: `images/sidebar/f22_raptor_sidebar.webp`
- Integrated into `unitRenderer.js` (body, turret skip, ammo bar, altitude adjustments)

## AI Support
- Added to `enemyAIPlayer.js`: AI produces F22s when airstrips are available
- Added to `llmStrategicController.js` unit catalog with `weapon: 'missile'`, `radarInvisible: true`, `spawnsFrom: 'airstrip'`
