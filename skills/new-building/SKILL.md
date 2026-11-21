---
name: new-building
description: Add or revise a Code for Battle building, including the mandatory two-stage art approval, data, prepared sprites, production and tech-tree wiring, AI, persistence, tests, and documentation.
---

# New Building Implementation Checklist

Use this workflow for every building. Use [New Unit](../new-unit/SKILL.md) for mobile entities and its detailed rendering, audio, validation, and repository conventions.

## Mandatory art approval (before implementation)

1. Inventory existing art and visual references. Generate **one image containing all map-sprite proposals**. Map sprites use the game's top-down map perspective, transparent final background, correct footprint, and no baked UI.
2. Show that complete proposal sheet to the user and wait for an explicit choice. Crop and show a preview of the chosen map sprite; do not wire it into the game yet.
3. Using the chosen sprite as the visual reference, generate **one image containing all build-button proposals**. They must depict the same building in the established elevated sidebar perspective.
4. Show that complete proposal sheet and wait for an explicit choice. Crop and show previews of the chosen map sprite **and** chosen build button together. Obtain approval before implementing anything.
5. Preserve generation prompts, raw proposal sheets, choices, and provenance under `docs/asset-sources/`. Ship only WebP assets using the repository-required encoding settings.

## Implementation

- Add footprint, cost, health, armor, power, display name, smoke anchors, repair/sell behavior, and prerequisite flags to building data.
- Register the map image and sidebar/build button. Add the building to `scripts/build-prepared-sprites.mjs`, generate all DPR tiers, and update the prepared sprite manifest; runtime rendering must consume prepared assets rather than resize source art.
- Wire the production button, label, tooltip, queue timing, prerequisite checks, tech-tree unlock rules, and available-building catalogs.
- Audit AI API/digests, enemy build logic where useful, policy building types/effects, automation options, cheats, benchmark/mission layouts, and save/load or network state for new properties.
- Use center-based footprint and occupancy calculations and exclude self occupancy, following `AGENTS.md`.
- Add focused unit tests for data, requirements, unlocks, production, image mapping, and prepared sprites. Add behavioral coverage for any special building ability.
- Update the dedicated spec, `docs/changes/`, `features/unreleased/`, and prompt history. Run test-ID assignment, lint, unit tests, and build.
