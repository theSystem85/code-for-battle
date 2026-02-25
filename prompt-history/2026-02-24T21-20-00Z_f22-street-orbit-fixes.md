# Prompt History Entry

- UTC Timestamp: 2026-02-24T21:20:00Z
- LLM: copilot

## User Request Summary
Implement new F22 behavior and fixes:
1. F22 should only move on street tiles (airstrip passable area treated as street; blocked no-go rect remains blocked).
2. Save-load should restore airstrip occupancy/passability exactly like rebuilt airstrip.
3. Fix F22 takeoff progression (no post-engine stall on runway).
4. Keep F22 engines off while moving on ground.
5. Limit airstrip parking slots to 7.
6. F22 should orbit/circle around commanded destination and auto-return before fuel reaches zero.

## Implementation Notes
- Added street-only grounded F22 movement restrictions and taxi pathing options.
- Rebuilt save-load map footprint reconstruction using canonical building placement path.
- Patched movement state sequencing to avoid generic path logic overriding F22 runway states.
- Added airborne orbit + low-fuel RTB behavior.
- Reduced airstrip F22 slot count to 7.
