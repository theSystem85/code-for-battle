# Rocket Turret vs Apache Damage Tuning

## Summary
- Rocket turret rockets must destroy an airborne Apache in exactly three direct hits.
- The damage adjustment must be scoped to rocket turret anti-air rockets versus Apache helicopters only.
- Rocket tank, Apache, and other anti-air interactions must remain unchanged.

## Requirements
1. When a `rocketTurret` rocket explosion damages an airborne `apache`, the explosion applies an Apache-specific bonus multiplier so each direct hit deals at least 14 damage against the Apache's 40 HP pool.
2. Three direct `rocketTurret` rocket hits are sufficient to destroy an airborne Apache.
3. The Apache-only damage bonus does not apply to `rocketTank` rockets or non-Apache targets.
4. Coverage includes:
   - a unit test for the projectile/explosion damage multiplier path, and
   - a Playwright E2E scenario that proves a rocket turret with only three rockets can still kill an Apache.
