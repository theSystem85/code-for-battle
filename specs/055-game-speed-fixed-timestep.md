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
