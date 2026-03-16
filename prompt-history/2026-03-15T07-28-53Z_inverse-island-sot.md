# Add Inverse SOT For Enclosed Islands

**UTC Timestamp:** 2026-03-15T07:28:53Z  
**LLM:** Copilot (GPT-5.4)

## Prompt

> now there are not SOT for the island but I want the algo to make the island smooth so it should render grass SOT tiles over the water tiles on all 4 inwards pointing corners (see image how it renders now and where I want SOT)

## Summary of Changes

- Extended the SOT mask so water tiles can host inverse land/street corner overlays for enclosed islands.
- Updated both the canvas and WebGL render paths to draw typed SOT overlays on any tile, not just water on land.
- Added focused unit coverage for the enclosed cross-island case in both the mask and WebGL batch generation paths.