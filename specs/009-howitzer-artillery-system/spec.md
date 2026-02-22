# Feature Specification: Howitzer Artillery Gun Animation & Control

**Feature Branch**: `009-howitzer-artillery-system`
**Created**: 2025-11-10
**Status**: Draft
**Input**: "use public/images/map/units/tankV1_barrel.png also for the howitzer so that when the howitzer aims at a target the barrel is lifted to point into the air for a ballistic trajectory. The howitzer has no turret to turn for aiming so the entire wagon is turning into direction of the target (already implemented). Come up with a nice realistic looks transformation and animation so that the barrel will point into the same direction the grande will start to fly along as well. the mounting point on the gun barrel is 2x0y and the mounting point on the howitzer is 30x30y (based on the original image assets for the map). Ensure there is also a retreat and flash animation similar to the one of the tank and make it a bit stronger. The flash should go to both sides and not in all directions. Make sure the howitzer does not fire before it has lifted his gun barrel slowly at the target. Also ensure the howitzer does not start to drive before it has lowered its gun barrel to be parallel to ground level again. Lifting and lowering it can take up to 4s depending on how far away the target is."

---

## Overview

Howitzers now reuse the tank V1 barrel sprite and animate the gun assembly to simulate artillery elevation and recoil. The barrel pivots from the chassis mount at (30,30) using the barrel hinge at (2,0) in the barrel texture. Elevation aligns with the ballistic launch angle of fired shells. The wagon still handles yaw; elevation is applied as a slow pitch animation that depends on target range. When idle or about to move, the barrel automatically returns to a level orientation.

Key visual cues include a reinforced recoil motion, directional muzzle flash jets that vent sideways, and movement/firing locks while the gun is adjusting. Elevation transitions take up to 4 seconds for close targets and shorten for distant shots, matching artillery pacing.

---

## Requirements

1. **Shared Barrel Asset**
   - Load `/public/images/map/units/tankV1_barrel.png` for every howitzer and align it with the map sprite using mount points (wagon: 30x30, barrel: 2x0).
   - The base howitzer image continues to supply the chassis and carriage visuals.

2. **Elevation Animation**
   - Compute a desired elevation angle that matches the launch angle of the projectile arc used in gameplay.
   - Animate `0 → angle` and back using eased motion that can last up to 4 seconds for close targets (higher elevation) and roughly 1.4 seconds for long-range (low elevation) shots.
   - Track barrel state (`raising`, `ready`, `lowering`) so firing can only occur when the barrel is aligned.

3. **Movement & Fire Lockouts**
   - Prevent howitzers from firing until the barrel is in position.
   - Prevent howitzers from accelerating if the barrel is still elevated and there is no target (lower before moving).

4. **Recoil & Muzzle Flash**
   - Apply a stronger recoil than tanks (≈40% more distance) that pulls the barrel backwards along its axis.
   - Render a directional muzzle flash that emits two lateral jets (left/right) with a bright core, no omnidirectional glow.
   - Rotate the borrowed tank barrel texture by 180° relative to its tank usage so the muzzle lines up with the carriage heading, and ensure recoil/muzzle flash offsets follow the flipped orientation.

5. **State Exposure**
   - Store barrel elevation, target elevation, world launch angle, readiness flag, and movement lock directly on the unit instance for gameplay and rendering systems to use.

6. **Production Prerequisite**
   - Howitzer production MUST remain locked until the player has completed an `artilleryTurret`, in addition to existing radar and vehicle factory tech requirements.

---

## Acceptance Scenarios

1. **Barrel Alignment Before Firing**
   - **Given** a howitzer acquires a target, **When** the shell cooldown expires, **Then** the unit waits until the barrel elevation animation finishes before firing.

2. **Elevation Time Based on Range**
   - **Given** a close-range target, **When** the howitzer aims, **Then** the barrel lift lasts around 4 seconds, while a long-range target lifts in roughly 1.5 seconds.

3. **Movement Lock While Elevated**
   - **Given** a howitzer has no target but its barrel remains elevated, **When** the player issues a move order, **Then** the unit delays movement until the barrel returns to level.

4. **Directional Flash & Strong Recoil**
   - **Given** the howitzer fires, **When** the muzzle flash plays, **Then** two bright jets shoot sideways and the barrel recoils noticeably farther back than tank guns.

5. **Correct Mount Alignment**
   - **Given** a rendered howitzer, **When** observing the barrel pivot, **Then** the hinge appears at the wagon’s carriage position without drifting or offset during animation.

6. **Prerequisite Enforcement**
   - **Given** a player has radar and a vehicle factory but no artillery turret, **When** opening unit production options, **Then** the howitzer remains unavailable until an artillery turret is built.

---

## Non-Goals

- No changes to projectile damage, splash, or cooldown balance.
- No new audio; reuse existing firing sounds.
- No additional UI indicators for gun state beyond the animated barrel.
