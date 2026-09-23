# New Sound Effects Implementation Summary

## Sounds Added

### 1. movingAlongThePath.mp3
- **When**: Played when a unit reaches a waypoint (but not the final destination)
- **Where**: `src/game/unifiedMovement.js` in the waypoint detection logic
- **Implementation**: 
  - Only plays for player-owned units
  - Has 2-second throttle to prevent spam
  - Uses positional audio based on unit location

### 2. chainOfCommandsReceived.mp3
- **When**: Played when Alt/Option key is released after adding waypoints to the command queue
- **Where**: `src/input/keyboardHandler.js` Alt key release handler + `src/game/waypointSounds.js`
- **Implementation**:
  - Tracks if waypoints were added during Alt key press
  - Plays sound only when Alt is released AND waypoints were added
  - Uses stackable sound queue for narration

### 3. ourBaseIsUnderAttack.mp3
- **When**: Played when player's base buildings are attacked by enemies
- **Where**: `src/game/attackNotifications.js` + integrated into `src/game/bulletSystem.js`
- **Implementation**:
  - 60-second cooldown to prevent spam
  - Checks if target is a player base building (construction yard, power plant, refinery, etc.)
  - Only triggers on enemy attacks (not friendly fire)

### 4. ourHarvestersAreUnderAttack.mp3
- **When**: Played when player's harvesters are attacked by enemies
- **Where**: `src/game/attackNotifications.js` + integrated into `src/game/bulletSystem.js`
- **Implementation**:
  - 60-second cooldown to prevent spam
  - Checks if target is a player harvester
  - Only triggers on enemy attacks (not friendly fire)

## Files Created/Modified

### New Files:
- `src/game/attackNotifications.js` - Handles base and harvester attack notifications
- `src/game/waypointSounds.js` - Tracks waypoint addition for chain of commands sound

### Modified Files:
- `src/sound.js` - Added the 4 new sound entries to soundFiles object
- `src/game/bulletSystem.js` - Added attack notification calls when damage is dealt
- `src/game/unifiedMovement.js` - Added waypoint reached sound when units reach waypoints
- `src/input/keyboardHandler.js` - Added Alt key release tracking for chain of commands sound
- `src/input/mouseHandler.js` - Added waypoint tracking when commands are queued with Alt key

## Sound Usage Requirements Met:

✅ **movingAlongThePath.mp3**: Plays when a new waypoint is being followed  
✅ **chainOfCommandsReceived.mp3**: Plays when new waypoints are added but only when Alt key is released  
✅ **ourBaseIsUnderAttack.mp3**: Plays when player's base gets attacked (max once per minute)  
✅ **ourHarvestersAreUnderAttack.mp3**: Plays when player's harvesters get attacked (max once per minute)

## Naval audio (2026-09-23)

Registered in `src/sound.js` and specified in `specs/088-naval-unit-audio.md`.

- Submarine surfacing, diving, and torpedo one-shots play from `updateSubmarine`.
- `battleshipCruise` and `hovercraftMoving` are positional movement loops, stopped when speed drops, using the tank-engine loop handle.
- `battleshipFire` randomly plays `battleshipFire1/2/3.mp3` on each barrel shot.
- `shipSinking` plays once when any naval unit is destroyed.
- `ourBattleshipGotAttacked`, `ourSubmarineGotAttacked`, `ourCarrierGotAttacked` (`aircraftCarrier`), `ourHovercraftGotAttacked`, and `ourShipsGotAttacked` (destroyer and every other naval type) use the stackable narrator queue with a separate 60-second cooldown per line.

## Technical Features:
- Proper throttling for attack notifications (60 seconds)
- Positional audio for waypoint sounds
- Stackable sound queue for narrated sounds
- Clean separation of concerns with dedicated modules
- Only triggers for appropriate player vs enemy interactions
