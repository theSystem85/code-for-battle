# 2026-02-25T10-31-31Z
- LLM: copilot

## Prompt Summary
Fix the latest F22 regression batch with these requirements:

1. Add building HUD bar hover tooltips for HP/ammo/fuel (same style as unit HUD).
2. Prevent F22 from attacking own buildings unless force-attack is used, including blocked cursor + blocked command behavior.
3. Fix F22 move/attack command stalling while on airstrip/ground states.
4. Ensure entity opacity debug toggle affects all units/buildings.
5. Make clicking own airstrip for F22 issue landing flow (approach from right, roll to strip start, taxi to parking slot).
6. Stabilize cruise/circle mode around move target to a larger radius.
7. Make F22 fire full rocket burst with ~333ms spacing and continue passes until volley completion.
8. Restrict airborne F22 attackability to anti-air shooters (rocket/air units), not normal ground-only weapons.
