# 2026-07-12T12:53:52Z

**Model:** Codex

The performance is still not better, but an important physical-device observation isolates the trigger: FPS stays normal while scrolling across grass, rocks, water, buildings, and other terrain. As soon as street tiles enter the viewport, FPS drops dramatically. Fix the street-specific issue and restore smooth 60fps performance on iPhone 13 Pro Max.

The supplied `?monitor` capture was recorded on iPhone OS 18.7 Safari with a 430x775 viewport, native DPR 3 and effective DPR 1, on a 100x100 seed-4 map. The game was paused while scrolling, requested and rendered WebGL terrain with `streetAtlas: true`, and produced zero timing samples because paused frames were not recorded. The final scroll offset was approximately `(1058, 1397)`, where street terrain had entered view.
