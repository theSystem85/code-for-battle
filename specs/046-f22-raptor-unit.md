# F22 Raptor - Unit Specification

## Overview
The F22 Raptor is a stealth fighter jet unit that provides powerful air-to-ground strike capability. It is the second air unit in the game, complementing the Apache helicopter with higher speed and missile-based attacks.

## Unit Properties
- **Type**: `f22`
- **Cost**: 5000
- **Health**: 60
- **Speed**: 9.0 (faster than Apache at 5.06)
- **Rotation Speed**: 0.22
- **Armor**: none (stealth aircraft)
- **Is Air Unit**: true

## Weapon System
- **Ammo**: 6 missiles per sortie
- **Damage**: 50 per missile
- **Fire Rate**: 4000ms between shots
- **Range**: ~1.5x tank fire range × 1.8 multiplier
- **Projectile**: 'rocket' type, origin 'f22Missile', speed 7

## Tech Tree
- Requires: **Helipad** + **Radar Station**
- Unlocked when both buildings are player-owned and operational

## Spawning
- Spawns from Helipad building (same as Apache)
- Uses helipad landing/takeoff system
- Stays grounded until ordered to move or attack

## Ammo/Fuel System
- Returns to helipad automatically when missiles depleted
- Refueled and rearmed at helipad (12000ms rearm time for 6 missiles)
- Fuel: 4000 tank, 100 consumption per second

## AI Behavior
- Does NOT currently appear in AI production queue (player-only unit)
- Auto-returns to helipad when ammo empty
- Maintains standoff distance when attacking

## Rendering
- Map image: `public/images/map/units/f22_raptor_map.webp`
- Sidebar image: `public/images/sidebar/f22_raptor_sidebar.webp`
- Shadow rendered when airborne
- Altitude lift applied to visual position (altitude × 0.4)

## Implementation Files
- `src/config.js` - unit costs, properties, colors, ammo, gas
- `src/units.js` - createUnit initialization
- `src/productionQueue.js` - helipad spawning
- `src/game/movementCore.js` - flight state updates
- `src/game/helipadLogic.js` - landing/rearming
- `src/game/unitCombat/f22Combat.js` - missile combat
- `src/rendering/f22ImageRenderer.js` - image rendering
- `src/rendering/unitRenderer.js` - render integration
- `src/input/unitCommands/airCommands.js` - landing commands
