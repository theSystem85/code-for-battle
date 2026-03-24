# 055 - Game speed fixed timestep and simulation clock

## Summary
The sidebar game-speed input must scale simulation time without changing render FPS and without making gameplay depend on the browser frame rate.

## Requirements
1. The sidebar speed input updates `gameState.speedMultiplier` immediately while the match is running.
2. Standard single-player simulation uses a fixed simulation step with an accumulator so 75 FPS and 60 FPS produce the same world progression over equal wall-clock time.
3. Render cadence remains tied to the browser frame loop / limiter and must not be multiplied by the game-speed setting.
4. Core simulation systems that depend on time must advance from simulation time or fixed-step deltas, not raw wall-clock frame timing:
   - unit movement and rotation
   - production/build progress
   - harvester harvest and refinery unload
   - service/refill/repair systems
   - projectile and rocket travel
   - airborne takeoff / landing state transitions
   - AI strategic / tactical decision timing
5. Existing host / lockstep flows continue to advance simulation time deterministically via the same fixed-step model.
6. Regression coverage must include:
   - speed input affecting simulation speed
   - frame-rate independence for representative movement / production behavior
   - render-loop independence from speed input

7. Defensive building charge/fire sequences and AI/LLM building-sell timers must also use simulation time so they stay synchronized with pause/speed controls.
8. Simulation-time visual effects and HUD timers must not mix wall-clock `performance.now()` with simulation timestamps; projectile impact explosions, turret muzzle flashes, recoil, and harvester unload/harvest progress must render from the same simulation clock.
9. The sidebar speed control is a persisted slider with range `0.5` to `5.0`, step `0.5`, default `1.0`, positioned above the Multiplayer section, and its current value must be restored from saves/autosaves and written back immediately when changed.
10. Movement/pathfinding support timers that influence unit steering or stuck recovery must stay on simulation time, and attack-path `moveTarget` values must remain in tile coordinates so units do not oscillate between adjacent tiles under increased speed multipliers.
