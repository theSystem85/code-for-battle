# Skills: Grok Imagine art (units and buildings)

Agent skills for this repo also live under `skills/`:
- `skills/new-unit/SKILL.md` — new unit checklist, including the mandatory art-approval flow
- `skills/new-building/SKILL.md` — new building checklist, including the mandatory art-approval flow
- `skills/ship-unit/SKILL.md` — ship unit checklist
- `skills/map-assets/SKILL.md` — biome decorative map tiles / SSE sheet pipeline
- `skills/make-a-release/SKILL.md` — "make a release": fold unreleased notes, dev -> main rebase merge, tag, dev reset

Generate every game-asset image with **Grok Imagine only**. Never use ChatGPT, OpenAI image models, or any other image generator.

## Who generates the art

- If a coding agent (Codex or any other vendor) is prompted directly, with no Grok Bot involved, that agent runs the full art-approval flow itself (8 map options, user pick, 8 fresh button options, user pick) before implementing. It must generate images with the **xAI Grok Imagine API**.
- If Grok Bot is orchestrating the task, Grok Bot runs the art flow with the user first (built-in GenerateImage tool), then hands the coding agent only the picked final images (paths or already-committed files). The coding agent must not generate or replace art; it only wires the provided images into the game.

## Approval order

1. Show the user **8 varied map-sprite options** as one numbered contact sheet and wait for a pick (or about 4 close variants if they ask to tweak a pick).
2. Only after the map pick, show **8 build-button options** as one numbered contact sheet. Each button is a completely new generation that matches the chosen shape and silhouette but uses its own ground-level or eye-level camera and lighting. Never paste or composite the map sprite onto a desert background, and never keep the map-sprite camera.
3. Commit or implement nothing until the user has picked both. Then commit images only if asked, and reference them in the spec. Units and buildings do not need a separate construction icon; the build button serves as that icon.
4. Show the contact sheets themselves, not file paths. Check every image before showing it and mention weak options honestly.

See `skills/new-building/SKILL.md` and `skills/new-unit/SKILL.md` for the full checklist. Prompt templates: `docs/BuildingImageAssetGenerationPromptTemplate.md` and `docs/UnitImageAssetPromptTemplate.md`.

## Setup for a coding agent using the xAI Grok Imagine API

1. Set the xAI API key before running generation commands (`XAI_API_KEY`).
2. Generate images with Grok Imagine only, via the xAI API — never OpenAI or another vendor's image model.
3. Save outputs in this repo using existing conventions:
   - Unit sidebar image: `public/images/sidebar/<unit_name>.webp`
   - Unit map image: `public/images/map/units/<unit_name>.webp`
   - Building sidebar image: `public/images/sidebar/<building_name>.webp`
   - Building map image: `public/images/map/buildings/<building_name>.webp`
4. Match current asset format/style:
   - Keep `.webp` format
   - Keep similar framing, perspective, and contrast to existing assets in those folders
   - Keep transparent background when required by existing art style

## Prompt templates

Use the templates in `docs/UnitImageAssetPromptTemplate.md` and `docs/BuildingImageAssetGenerationPromptTemplate.md`. Generate and present the **map sprite options first**, wait for the user to pick, then generate **fresh build-button options**. Do not generate the sidebar/button art first.
