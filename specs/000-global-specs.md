# Global Game Specifications

This document contains global specifications that apply across the entire game.

## Measurement Units and Scale

### Tile-to-Meters Conversion

The game uses a dual scale system for different purposes:

| Purpose | Conversion Factor | Constant | Notes |
|---------|------------------|----------|-------|
| **Speed/Movement calculations** | 1 tile = 1000 meters | `TILE_LENGTH_METERS` | Used for vehicle speed calculations (km/h to pixels/frame) |
| **Cursor range display** | 1 tile = 10 meters | `CURSOR_METERS_PER_TILE` | Used for UI display of attack range and distance to target |

### Constants Reference

- `TILE_SIZE` = 32 (pixels per tile)
- `TILE_LENGTH_METERS` = 1000 (for speed calculations - legacy)
- `CURSOR_METERS_PER_TILE` = 10 (for UI range display)

## Cursor System

### Attack Cursor Behavior

When a player's combat unit is selected and hovering over a potential target:

1. **In-Range Target**: Shows attack cursor (`attack-mode`)
2. **Out-of-Range Target**: Shows out-of-range cursor (`attack-out-of-range-mode`)

### Range Information Display

When hovering over any enemy with combat units selected:
- **Distance to target** (top): Shows current distance in meters (e.g., "150m")
- **Unit max range** (bottom): Shows the selected unit's maximum firing range in meters (e.g., "120m")

The display uses:
- Black text color
- White semi-transparent background
- Positioned near the cursor

### Combat Unit Types

The following unit types are considered attack-capable for cursor/range detection:
- `tank`, `tank_v1`, `tank-v2`, `tank-v3`
- `rocketTank`
- `howitzer`
- `apache`
- `artilleryTurret` (building)

## Production Speed Scaling

## Alert Mode Visual Indicators

- `tank-v2` alert mode must render only the larger pulsing red firing-range ring (`TANK_FIRE_RANGE`) and must not render an inner tile-sized red circle.
- Utility service units in alert mode keep their additional larger discovery-range ring.

- Vehicle factory count accelerates unit production time using a multiplier equal to the number of vehicle factories owned by the player (1 factory = 1x, 2 factories = 2x, etc.).
- The multiplier applies to ground vehicles and Apache helicopters (helicopters still spawn from Helipads, but their build time is reduced by the same vehicle factory multiplier).


## Selected-Unit HUD Hover Tooltips

- Hovering selected-unit HUD bars must show both the hovered stat label and its absolute value when available:
  - Health: `health <value>` (e.g. `health 30`)
  - Ammo: `ammo <value>` in raw shots/rounds/rockets (not burst-grouped)
  - Fuel: `fuel <value>m` converted to meters using `CURSOR_METERS_PER_TILE` (1 tile = 10m)
- Tooltip value resolution must be field-based (shared stat fields like `health`, `maxAmmunition`, `maxRocketAmmo`, `maxAmmoCargo`, `maxGas`) so newly added compatible units/buildings inherit behavior automatically without per-type hardcoding.

## Sidebar Money Tooltip

- Clicking or tapping the sidebar money bar (or the mobile money display) opens a tooltip showing:
  - Each player-owned ore refinery and its total revenue generated.
  - Each player-owned harvester with total money earned, harvest cycle time in seconds, fuel percentage, and crew status.
- Each refinery/harvester row is a link that selects the entity and centers the camera on it.

## Enemy Resource Display

- When `showEnemyResources` is enabled and an enemy construction yard is selected, display the enemy budget and power supply values using the current aggregated enemy power state.
- Power display must always render a numeric value, defaulting to 0 when any building power values are missing or invalid.

## Modal Layout Constraints

- All modal dialogs must be capped at 80% of the viewport height (`80vh`) to avoid exceeding the visible screen space on smaller devices.
- Modal bodies should remain scrollable when content exceeds the height cap.
- Mobile overrides (such as settings/keybindings and cheat dialogs) must keep the 80vh cap as well.

## Related Files

- [src/config.js](../src/config.js) - Constants definition
- [src/input/cursorManager.js](../src/input/cursorManager.js) - Cursor state management
- [src/input/mouseHandler.js](../src/input/mouseHandler.js) - Range detection logic
- [cursors.css](../cursors.css) - Cursor styles

## Movement System Modules

Ground and air movement logic is split across modular files to keep each under 1k LOC and reduce coupling:
- Core orchestration: [src/game/movementCore.js](../src/game/movementCore.js)
- Collision and avoidance: [src/game/movementCollision.js](../src/game/movementCollision.js)
- Apache flight state: [src/game/movementApache.js](../src/game/movementApache.js)
- Stuck recovery/dodge helpers: [src/game/movementStuck.js](../src/game/movementStuck.js)
- Shared helpers/constants: [src/game/movementConstants.js](../src/game/movementConstants.js), [src/game/movementHelpers.js](../src/game/movementHelpers.js)
- Player-issued ground move routes must not be discarded during local stuck recovery; recovery should splice a short local avoidance detour into the existing route and continue toward the same destination.
- Local obstacle evasion must be visualized in movement path rendering: active evasion path fragments are drawn in blue while the remaining planned route stays orange.

## Audio Loading Policy

- Sound effects and music must load lazily (on demand) when first needed, not during initial browser load.
- Startup code must not prefetch or preload the full sound library.
- Runtime audio caching is allowed after first use to avoid repeat network fetches.
- Looped movement audio must fade out immediately (short sub-0.1s fade) when the owning unit stops moving or movement is canceled.
- Each unit may own at most one active movement loop at a time; async sound-start paths must guard against duplicate per-unit loop playback during loading.

## Licensing

- The repository is licensed under the MIT License.
- The canonical license text must be kept in the root `LICENSE` file.
- Package metadata must declare `"license": "MIT"` in `package.json`.
