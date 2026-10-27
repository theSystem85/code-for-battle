# 2026-10-27 08:50:27 UTC — Soil puddle frequency

Model: Codex using GPT-5.6 Sol.
Harness: Codex.
Token counts were not available for this run.

## Prompt

Repo work on branch `dev` only. Commit on the result branch (we apply onto `dev` after a clean rebase). Do not open a pull request. English only. Conventional commits (commit messages per AGENTS.md). Follow AGENTS.md (rules 1-4, 12-20): unit tests, lint, docs/changes entry, features/unreleased JSON if applicable, and a unique prompt-history file naming the exact model used (Codex).

TEST POLICY: Run `npm run lint`. Run unit/integration tests for files you touch and `npm run test:unit` if AGENTS.md requires it; fix real failures. Dedicated e2e ONLY if absolutely necessary. Do NOT run the full Playwright / e2e suite. Do NOT run GPU/FPS benchmarks.

## IMPROVEMENT: soil decorative water puddle overrepresented

User screenshot (described — imagine a small soil biome patch): five identical circular murky water puddles with a thick orange-brown debris ring appear in a very small viewport of soil ground. Asset is `group_4` on sheet `dtv6_decor_soil.webp` / `public/images/map/sprite_sheets/dtv6_decor_soil.json`.

Current tags on those `group_4` tiles (cells like `6,0`–`8,1`): `soil`, `decorative`, `water`, `impassable`, `group_4`. They do **not** have the `lake` tag.

Placement context (verify yourself):
- `isLakeSprite` in `src/rendering/decorationLayout.js` requires tag `lake` and not `shore`.
- Lakes get their own budgeted pass via `placeBudgetedDecorations({ predicate: isLakeSprite, target: options.lakeCount, ... })` before ordinary multi/single land props.
- Props tagged only `water` (without `lake`) fall into the normal multi-tile decoration bags and can be placed densely via the density/interval pass — which matches the overrepresentation on soil.

User suggestion (non-binding hypothesis — verify and choose the right fix): add the `lake` tag so these puddles participate in the lake budget / spacing, OR otherwise ensure this decorative water tile is not overrepresented on soil maps (spacing, weight, budget, rarity). Prefer the smallest correct change that keeps intentional rare puddles possible without five copies in a tiny area. Check whether the same asset pattern exists on other biome decor sheets (`dtv6_decor_*`) and keep behavior consistent if they share the problem.

Do not gut all water decoration; do not change gameplay of real terrain water. Keep impassable where appropriate. Update sheet JSON tags and/or placement logic as needed; if tags change, ensure any consumers (SSE, map-assets skill, tests) stay coherent.

## Done when
- On soil maps, `group_4` / this puddle sprite no longer dominates small regions; frequency is clearly reduced (lake-budget / spacing / weight — whichever you prove correct).
- Focused unit tests cover the classification/budget path (e.g. group_4 with lake participates in lake placement, or density cap); use new unique U06xxx IDs not already on `dev`.
- `npm run lint` clean on touched files; docs/changes + features/unreleased + prompt-history updated.
- Final message: root cause, fix chosen, files touched, test/lint results.
