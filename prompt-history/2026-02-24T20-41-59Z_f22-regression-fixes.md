# Prompt History Entry
- UTC Timestamp: 2026-02-24T20-41-59Z
- LLM: copilot

## Prompt Summary
Fix additional F22/airstrip regressions:
1. Grounded F22 could not fire.
2. Airstrip should not movement-occupy tiles (build-only blocking for placement only).
3. F22 spawn points were incorrect (unit appeared near top-left map instead of airstrip points).
4. Revisit coordinate origin assumptions for spawn points and airstrip occupied rectangle (origin is top-left).
5. Show airstrip ammo/fuel bars when selected (same style as helipad side bars).

## Implementation Notes
- Fixed coordinate conversion by preserving both tile and world coordinates for airstrip runway/parking points.
- Applied source-space (`768x512`) top-left scaling for all specified airstrip points.
- Corrected spawn world-position usage to avoid tile/world mixups.
- Enabled grounded F22 in-range attack without forced takeoff.
- Changed airstrip footprint handling to build-only occupancy so movement remains passable.
- Extended building overlay rendering to include airstrip fuel/ammo side bars.
