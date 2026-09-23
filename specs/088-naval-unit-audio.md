# Spec 088: Naval unit audio

## Summary
Play positional naval sound effects and stackable narrator lines for the local player's ships. Audio uses the existing `sound.js` registry, `playPositionalSound` / `playLoop` movement loops, and the narrated queue already used by base and harvester under-attack lines.

## Assets
Files live in `public/sound/` and are registered in `src/sound.js`:

| Event | File(s) | Trigger |
| --- | --- | --- |
| `submarineSurfacing` | `submarineSurfacing.mp3` | Submarine depth transition finishes in the surfaced state |
| `submarineDiving` | `submarineDiving.mp3` | Submarine depth transition finishes in the submerged state |
| `submarineTorpedo` | `submarineTorpedo.mp3` | Submarine launches a torpedo |
| `battleshipCruise` | `battleshipCruise.mp3` | Positional loop while a battleship's movement speed is above `MIN_SPEED` |
| `hovercraftMoving` | `hovercraftMoving.mp3` | Positional loop while a hovercraft's movement speed is above `MIN_SPEED` |
| `battleshipFire` | `battleshipFire1.mp3`, `battleshipFire2.mp3`, `battleshipFire3.mp3` | Each battleship barrel shot; `playAssetSound` picks one file at random |
| `shipSinking` | `shipSinking.mp3` | Any naval unit starts its destruction sequence |
| `ourBattleshipGotAttacked` | `ourBattleshipGotAttacked.mp3` | Local player's battleship is attacked |
| `ourSubmarineGotAttacked` | `ourSubmarineGotAttacked.mp3` | Local player's submarine is attacked |
| `ourCarrierGotAttacked` | `ourCarrierGotAttacked.mp3` | Local player's `aircraftCarrier` is attacked |
| `ourHovercraftGotAttacked` | `ourHovercraftGotAttacked.mp3` | Local player's hovercraft is attacked |
| `ourShipsGotAttacked` | `ourShipsGotAttacked.mp3` | Local player's destroyer, supply ship, vehicle ferry, naval mine layer, or any other naval type |

## Wiring
- Depth completion and torpedo launch: `updateSubmarine` in `src/game/navalFleetSystem.js`.
- Battleship gunfire: `fireBattleshipBarrel` in `src/game/navalFleetSystem.js`.
- Cruise / hovercraft loops: `updateUnitPosition` in `src/game/movementCore.js`, using the same engine-loop handle, fade-out, and idle stop as `tankDriveLoop`.
- Sinking: `cleanupDestroyedUnits` in `src/game/gameStateManager.js`, once, beside the naval explosion.
- Narration: `handleAttackNotification` in `src/game/attackNotifications.js`. Bullet hits call it directly. Depth-charge detonations and water-mine damage call `notifyEntityUnderAttack` in `src/game/attackAlertBridge.js`, which forwards to the same handler once that module has loaded. The bridge avoids a startup cycle through input handling. Each naval line has its own 60-second cooldown and uses the stackable narrator queue (`playSound(name, 1.0, 0, true)`). The per-unit focus notification from spec 045 still appears.

## How to test
1. Spawn a submarine, order it to attack a ship, and listen for the surfacing sound when it finishes rising, then the torpedo sound on launch. Clear the target and wait for it to finish diving.
2. Move a battleship and a hovercraft. The cruise / hover loops should follow the unit and stop when the unit stops.
3. Have a battleship fire. Each barrel shot plays one of the three gun variants.
4. Destroy any naval unit and confirm the sinking sound plays with the explosion.
5. Let an enemy damage the local player's battleship, submarine, carrier, hovercraft, and destroyer. Each matching narrator line plays, lines can queue, and the same line does not repeat for 60 seconds. The clickable "under attack" notice still focuses that unit.

## Performance
Movement loops run on the unit movement tick and only for battleships and hovercrafts. After the loop starts, each moving ship updates an existing gain and pan node, matching the tank engine loop. No extra canvas fills, sprite variants, or per-frame allocations were added.

75 presented FPS is not certified in this environment. This session is headless and cannot measure a 75 Hz display. The qualifying-hardware check remains outstanding. Do not treat unit tests as an FPS pass.
