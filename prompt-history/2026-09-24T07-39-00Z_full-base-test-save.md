# 2026-09-24T07:39:00Z

**Model:** Grok 4.7 in the Cursor Cloud Agent harness. Reasoning level and token counts were not available for this run. The implementation and unit-test run finished at 2026-09-24T07:50:54Z.

## Prompt

Repo: theSystem85/code-for-battle (2D RTS).

## Goal
Add a **default locked save game** for testing, similar to how the 1st mission (or other locked/preset saves) works in this project.

## What the save should contain
1. **Player (local / human side)** already has **all units and buildings built once** — i.e. one of each unit type and one of each building type that the game supports for a normal match/base. Include:
   - A **shipyard** (so the map must have **water** adjacent/usable for naval buildings)
   - An **airport** (airstrip)
   - **As many power plants as needed** so the base is not power-starved given that full set of buildings
2. **Enemy** on the map should **only** have a **construction yard** (nothing else — no units, no other buildings).
3. Map must have **water** so shipyard placement/gameplay makes sense.
4. Treat this like other locked/preset saves (e.g. 1st mission): it should appear as a **locked/default** save the player can load for testing, not something they accidentally overwrite. Follow existing patterns for locked missions/saves in the repo.

## How to implement
- Investigate how Mission 01 / locked saves / default save slots are defined and loaded (Save/Load UI, mission presets, seed maps, serialized game state, etc.).
- Prefer matching the existing locked-save / mission pattern rather inventing a parallel system.
- Place units/buildings in sensible, non-overlapping positions on a playable map with water near the player base.
- Name/label it clearly for testing (e.g. something like "Full base test" / locked test save — use whatever naming convention the codebase uses for locked saves).
- Do **not** break existing Mission 01 or other locked saves.

## Constraints
- New branch + open a PR against main.
- Scope only what’s needed for this save + wiring into the save list / lock behavior.
- Run lint for changed files and unit tests if feasible.
- If the game has an authoritative list of unit/building types, use that so “all units and buildings once” stays complete as of current main.

## Done when
- A locked default save exists and shows up like other locked/preset saves.
- Loading it gives: full player tech/base once each (incl. shipyard + airport + enough power), water on map, enemy = construction yard only.
- PR opened; summarize how to find/load the save in the UI, and list what’s included.
