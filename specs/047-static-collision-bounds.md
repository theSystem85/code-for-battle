# 047 - Static Collision Push Damping and Pixel Bounds

## Goals
- Reduce aggressive wall pushback for ground units.
- Make static-obstacle response depend on unit speed.
- Add damping after collision response.
- Apply static push only when penetration is meaningful (>25% into obstacle).
- Use collision checks based on unit sprite non-transparent bounds (not occupancy tile center only).
- Support build-time generation of unit bounds JSON and runtime loading of that data.

## Functional Requirements
1. Ground-vs-static collision detection must evaluate overlap using each unit type's local collision bounding box.
2. Collision bounding boxes must be derived from non-transparent sprite pixels.
3. The engine must load precomputed bounds from `public/data/unit-collision-bounds.json` when available.
4. If precomputed data is unavailable, runtime fallback generation must compute bounds from unit assets once before gameplay starts.
5. Static push impulse must be scaled by current movement speed relative to that unit's speed profile.
6. Additional normal damping must be applied after static collision response.
7. Static push/separation must only be applied when collision penetration ratio is at least 25%.

## Build-Time Workflow
- Add a script that scans unit map assets, extracts alpha bounds, converts to tile-space bounds, and writes JSON to `public/data/unit-collision-bounds.json`.
- Wire this script into prebuild so CI/release builds generate fresh data.

## Validation
- Linting via changed-files lint fixer.
- Unit movement/collision tests remain green.
- Generated bounds JSON exists and contains all supported unit types.
