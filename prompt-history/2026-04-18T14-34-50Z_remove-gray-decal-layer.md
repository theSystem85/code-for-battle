# Remove Gray Decal Underlay in Non-Custom Terrain Mode

**UTC Timestamp:** 2026-04-18T14:34:50Z  
**LLM:** Copilot (GPT-5.4)

## Prompt

> when custom sprite are off there and a decal is now rendered on a default map tile there is a gray layer on top of the map tile (that was also there when the decals did not work correctly yet because custom sprite were off) but the decal itself is now correctly shown on top of both, the map tile and that gray layer in between. Ensure to also remove that gray layer (visible on the black parts of the decals to got blended out). Make sure only the map tile and the decals is visible but no gray layer in between. As mentioned this only happens when custom sprites are off. Maybe it was a decal fallback from before that now needs to be removed because decals are now integrated by default.

## Summary of Changes

- Traced the gray layer to the legacy WebGL terrain decal fallback, which was still emitting semi-transparent decal color quads underneath the new 2D combat decal sheet in the non-custom-sprite path.
- Removed decal instances from the WebGL terrain batch so decal presentation is owned solely by the 2D map renderer.
- Added regression coverage to ensure the WebGL terrain batch no longer contributes a duplicate decal layer in that path.
