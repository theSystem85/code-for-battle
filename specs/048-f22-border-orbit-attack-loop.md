# Spec 048: F22 border avoidance + stable combat orbit loop

## Context
F22 flight behavior regressed near map edges and target loitering. The aircraft can touch/stick near borders, circle too tightly, and stall attack loops instead of repeating attack passes until target destruction or ammo depletion.

## Requirements
- F22 (player and enemy controlled) must proactively evade map borders before physically colliding with map bounds.
- F22 combat loiter/orbit behavior must reduce speed relative to full cruise when the aircraft is established around a target.
- F22 attack behavior must maintain large circular multi-pass approaches around the target and keep attacking until:
  - target is destroyed, or
  - rocket ammo is empty, then RTB/landing flow starts.
- Orbiting should avoid micro-stutter directly on top of the target.

## Acceptance Criteria
1. F22 remains away from border tiles during combat orbit and can recover inward if orbit center is near edge.
2. In orbit mode, measured target velocity is lower than full cruise speed.
3. F22 completes multiple attack passes around a surviving target and then requests return-to-base when rocket ammo reaches zero.
4. F22 minimum target distance during orbit remains in a wide-pass band (no tight top-of-target stutter).

## Verification
- E2E: `tests/e2e/f22BorderOrbitAndRtbBehavior.test.js`
