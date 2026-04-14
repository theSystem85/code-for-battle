# Feature Specification: Local Collision Lookahead for Units

**Feature Branch**: `012-local-collision-avoidance`
**Created**: 2025-01-14
**Status**: In Progress
**Input**: "ensure all units when moving prevent moving into obstacles before the actually collide with them when in close proximity to an obstacle (use local occupancy map for that) so that they change direction just in time (ensure not to change the actual high level path planning for that for efficiency reasons). Make sure to find an efficient solution to prevent units bouncing into wall or each other. Just some sort of look ahead short path prediction and avoidance!"

---

## Overview

Units should anticipate nearby blockers using the existing occupancy map and gently adjust their steering before actual contact. The goal is to keep the high-level path intact while reducing bouncebacks against walls and other units through short-range lookahead and micro-adjustments.

---

## Requirements

1. **Occupancy-Aware Lookahead**
   - Probe tiles immediately ahead of a moving unit (sub-tile increments) using the occupancy map and map grid; treat any occupied or impassable tile as a hazard.
2. **Gentle Steering Adjustments**
   - Apply lightweight avoidance forces that nudge movement away from detected hazards without rerunning high-level pathfinding.
3. **Unit and Obstacle Coverage**
   - Consider both static blockers (terrain, buildings, bounds) and nearby ground units when evaluating lookahead tiles.
4. **Performance-Conscious**
   - Keep the lookahead checks local (a few tiles at most) to preserve frame performance and avoid altering global path planning.
5. **Airborne Traffic Safety**
   - Apply an efficient, proximity-based avoidance pass for airborne units so helicopters steer away from each other before contact, without interacting with ground occupancy.
   - Air units must rely solely on predictive separation—no mid-air collisions, bounces, or collision damage are permitted.

6. **Self-Tile Exclusion for Ground Dodge/Reroute**
   - Ground-unit local dodge validation and stuck reroute checks must ignore the acting unit's own footprint tile when evaluating occupancy/proximity, preventing self-blocking false positives and reroute thrashing.

7. **No Premature Dodge Triggering**
   - Stuck/dodge escalation must only trigger from local blockage signals (e.g., recent local collision or near-next-waypoint obstruction), not from distant blockers further along the planned path/target tile.

8. **Environment Contacts Match Unit Contacts**
   - When a ground unit physically contacts a blocking building, wall, terrain tile, occupied map tile, or bounds edge, resolve the collision through a short-lived local repulsion force field plus only minimal positional separation, avoiding abrupt velocity rewrites or strong bounce impulses. Both the repulsion magnitude and immediate correction must be capped by the unit's actual current speed so pushback never exceeds the unit's own movement speed.
   - Refactoring should remove redundant legacy static-environment bounce code and keep the runtime path efficient by staying local to the contacted obstacle.

9. **Friendly Push Yield for Idle Units**
   - If a friendly ground unit is physically pushed by another friendly ground unit and the pushed unit has no active move target/path, the pushed unit must enqueue a one-tile movement in the push direction to clear space for the pusher.
   - This auto-yield must not override existing movement intent: units with an active `moveTarget`/path keep their current command.
   - Remote-controlled friendly pushers must be handled identically: remote/manual control cannot disable ally-yield behavior, including lower-speed push contacts.
