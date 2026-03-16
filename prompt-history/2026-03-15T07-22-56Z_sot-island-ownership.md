# Fix Enclosed Island SOT Ownership

**UTC Timestamp:** 2026-03-15T07:22:56Z  
**LLM:** Copilot (GPT-5.4)

## Prompt

> Ensure that when tiles of type A are inside tiles of type B like there is grass tiles inside water tiles that then the grass tiles are overlapping the water tiles and not the other way round. currently it falsely look like this (see image with arrows pointing at the wrng SOT)

## Summary of Changes

- Refined SOT corner eligibility so surrounding water can only smooth into land/street when that corner is backed by solid interior tiles of the inner terrain.
- Added unit coverage for narrow cross-shaped enclosed islands to ensure water no longer carves inward, while preserving smoothing for solid land masses with true corners.
- Updated the water rendering spec and bug tracker to record the corrected terrain-precedence rule.