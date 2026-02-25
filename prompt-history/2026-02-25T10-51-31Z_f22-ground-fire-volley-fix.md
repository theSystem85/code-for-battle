# 2026-02-25T10-51-31Z
- LLM: copilot

## Prompt Summary
Additional F22 fixes requested:

1. Prevent F22 from firing while still on the ground.
2. Ensure F22 burst fires all rockets during approach (not just one).
3. Add reload indication on F22 ammo bar, similar to rocket tank ammo HUD.

## Implementation Notes
- Removed grounded-fire command special-case and enforced airborne-only firing in F22 combat update.
- Updated F22 volley handling in combat flow so active volleys continue through completion even if range fluctuates during approach.
- Added reload progress indicator line for selected F22 ammo HUD using F22 fire-rate cadence.
