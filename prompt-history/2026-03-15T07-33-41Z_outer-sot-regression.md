# Fix False Outer Inverse SOT

**UTC Timestamp:** 2026-03-15T07:33:41Z  
**LLM:** Copilot (GPT-5.4)

## Prompt

> the island now is correct BUT now there are a lot false SOT outside. see the image I marked all with red arrows

## Summary of Changes

- Restricted inverse land/street-on-water SOT to true enclosed islands by rejecting candidate components that touch the map boundary or are bordered by non-water tiles.
- Added a focused regression test to ensure ordinary coastlines no longer receive false outer inverse SOT wedges.
- Updated the related spec and bug tracker entries to capture the boundary-connected coastline exclusion rule.