# 2026-10-27T08:56:06Z

Model: Codex using GPT-5.6 Sol
Harness: Codex

## Prompt

Work from the `dev` code line in English and commit the result with a conventional commit. Investigate and fix helicopters, including Apache and other helicopter types, hovering over airstrips without landing. Preserve existing carrier and F22/F35 landing behaviour.

When one or more aircraft are selected, show a green indicator on every compatible, unoccupied airstrip, helipad, or aircraft-carrier landing position. Clicking or tapping an indicator or its cell must order landing at that exact position. F22 Raptors must use the airstrip runway approach and then taxi to the selected position; F35s and Apache helicopters must land directly. Hide occupied or incompatible positions and clear indicators when aircraft are no longer selected or landing orders are cancelled as appropriate. Preserve air-wing attack, guard, stop-attack, refill, and return cycles.

Add focused unit tests with unused U06xxx IDs, run the required unit tests and lint commands, and update the change note, unreleased release JSON, feature specification, and uniquely named prompt history. Do not run the full Playwright suite or GPU/FPS benchmarks. Report the root cause, command and indicator design, touched files, and verification results.
