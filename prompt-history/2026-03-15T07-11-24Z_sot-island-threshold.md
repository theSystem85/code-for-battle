# Prevent Tiny Water SOT Islands

**UTC Timestamp:** 2026-03-15T07:11:24Z  
**LLM:** Copilot (GPT-5.4)

## Prompt

> look at the image to understand the problem! Prevent the SOT algorith from rendering SOT tiles when there is only 1 tile of type x in the middle of ofther tiles of type y. I do not wand to see singular triangles floating around. The smallest island where SOT applies should be a 3x3 cross. Do not write e2e tests for this.

## Summary of Changes

- Added a minimum connected-cluster threshold to SOT mask generation so tiny isolated land/street islands do not receive water or street corner smoothing.
- Added focused unit coverage for the singleton-island, sub-threshold island, and 3x3-cross-sized cases.
- Updated the water rendering spec and bug tracker to record the new shoreline constraint.