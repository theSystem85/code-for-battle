# Explosion Visual Radius

## Goal
Use the existing impact VFX for explosive service-building destruction at a large visual baseline while normal tank shell impacts use half that baseline. Keep visual sizing independent from damage and splash radii.

## Requirements
- `gasStation` and `ammunitionFactory` destruction emits the existing impact visual at the configured full baseline.
- Direct tank shell impacts emit that visual at 50% of the configured baseline.
- Rocket and other explosion visuals retain their existing sizing unless a caller supplies an explicit visual radius.
- The Graphics Effects UI exposes a pixel-radius slider, persists it with the other graphics settings, and shows the derived tank radius.
- The default full baseline is 64 pixels; the setting is clamped from 16 to 160 pixels.
- Existing prepared/cached impact resources are reused, and gameplay damage radii are unchanged.

## Performance acceptance
The change adds constant-time classification only when an explosion is spawned. Rendering continues through the existing bounded particle pool and prepared impact flash. Hardware 75 FPS validation remains pending on Patrick's qualifying GPU.
