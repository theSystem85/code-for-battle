---
name: new-building
description: Add or revise a Code for Battle building, including the mandatory two-stage art approval, data, prepared sprites, production and tech-tree wiring, AI, persistence, tests, and documentation.
---

# New Building Implementation Checklist

Use this workflow for every building. Use [New Unit](../new-unit/SKILL.md) for mobile entities and its detailed rendering, audio, validation, and repository conventions.

## Mandatory art approval (before implementation)

Generate every game-asset image with **Grok Imagine only**. Never use ChatGPT, OpenAI image models, or any other image generator. Grok Bot uses the built-in GenerateImage tool; a coding agent prompted directly uses the xAI Grok Imagine API.

### Who generates the art

- If a coding agent (Codex or any other vendor) is prompted directly, with no Grok Bot involved, that agent runs this entire art-approval flow itself (8 map options, user pick, 8 fresh button options, user pick) before implementing.
- If Grok Bot is orchestrating the task, Grok Bot runs the art flow with the user first, then hands the coding agent only the picked final images (paths or already-committed files). The coding agent must not generate or replace art; it only wires the provided images into the game.

Show the user the contact sheets themselves, not file paths. Check every generated image before showing it: correct silhouette, scale of details (for example small drones, not Predator-sized), no stray flags or logos, and the correct real-world reference (for example a SpaceX Mechazilla tower, not a classic gantry). Regenerate mismatches. When presenting a sheet, mention weak options honestly.

Nothing is committed or implemented until the user picks. After they pick, commit images only if they ask, and reference the chosen files in the spec. Buildings do not need a separate construction icon; the build button serves as that icon.

1. Inventory existing art and visual references. Generate **8 varied map-sprite options** and show them as **one numbered contact sheet**. Map sprites use the game's isometric 3/4 top-down map perspective, transparent final background, correct footprint, and no baked UI. Wait for an explicit choice.
2. If the user asks for a tweak of a pick (for example "option 2 but with two pairs of chopstick arms"), generate about **4 close variants** of that option and let them pick again. Do not start build-button art until the map sprite is chosen.
3. Only after the map pick, generate **8 build-button options** based on the chosen map design and show them as **one numbered contact sheet**. Each button must be a **completely new generation** that matches the building's shape and silhouette but uses its **own camera angle** (a ground-level or eye-level hero shot) and lighting. Never paste or composite the map sprite onto a desert background, and never keep the isometric map angle. Buttons are opaque, square, with desert ground under a blue sky.
4. Show that button sheet and wait for an explicit choice. Crop and show previews of the chosen map sprite and chosen build button together. Obtain approval before implementing anything.
5. Preserve generation prompts, raw proposal sheets, choices, and provenance under `docs/asset-sources/`. Ship only WebP assets using the repository-required encoding settings.

## Implementation

- Add footprint, cost, health, armor, power, display name, smoke anchors, repair/sell behavior, and prerequisite flags to building data.
- Register the map image and sidebar/build button. Add the building to `scripts/build-prepared-sprites.mjs`, generate all DPR tiers, and update the prepared sprite manifest; runtime rendering must consume prepared assets rather than resize source art.
- Wire the production button, label, tooltip, queue timing, prerequisite checks, tech-tree unlock rules, and available-building catalogs.
- Audit AI API/digests, enemy build logic where useful, policy building types/effects, automation options, cheats, benchmark/mission layouts, and save/load or network state for new properties.
- Use center-based footprint and occupancy calculations and exclude self occupancy, following `AGENTS.md`.
- Add focused unit tests for data, requirements, unlocks, production, image mapping, and prepared sprites. Add behavioral coverage for any special building ability.
- Update the dedicated spec, `docs/changes/`, `features/unreleased/`, and prompt history. Run test-ID assignment, lint, unit tests, and build.
