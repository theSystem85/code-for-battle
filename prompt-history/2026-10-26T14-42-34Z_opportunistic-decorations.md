# 2026-10-26T14:42:34Z — Opportunistic decorations

Model: Codex using GPT-5.6 Sol
Harness: Codex

## Prompt

Work from the current `dev` base and rework commit `3d18c2d6` without opening a pull request. Scroll rendering, including smooth and inertial motion, must always take priority. Prepare unseen decorations currently in the viewport only when the main thread has spare capacity; never show placeholders or remove already-shown in-viewport decorations because of capacity. Cull decorations only after they leave the viewport. Keep player buildings, units, basic terrain, roads, rocks, and cliffs immediate, and retain the optional decoration fade only if it remains stable. Investigate the existing map renderer, renderer, texture manager, game state, settings, and focused tests. Run lint and tests scoped to touched files, add change documentation and an unreleased entry, use English and a conventional commit, and identify the model as Codex.
