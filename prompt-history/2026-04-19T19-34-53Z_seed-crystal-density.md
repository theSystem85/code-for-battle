# Seed Crystal Density Falloff

**UTC Timestamp:** 2026-04-19T19:34:53Z  
**LLM:** GitHub Copilot (GPT-5.4)

## Prompt

> on map generation ensure the distribution of the density of the ore depends on the distance to the seed crystals of that ore field to indicate the the ore grew naturally out of the seed crystal

## Summary of Changes

- Updated ore-cluster generation so ore density now falls off deterministically with distance from each seed crystal.
- Added focused unit-test coverage for the new density falloff helper used by map generation.
- Updated the harvesting-density spec and TODO tracker to record the new map-generation requirement.