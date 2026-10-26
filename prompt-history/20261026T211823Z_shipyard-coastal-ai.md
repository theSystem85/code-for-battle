# 2026-10-26 21:18:23 UTC — Shipyard coastal placement and AI

Model: Codex using GPT-5.6 Sol.
Harness: Codex.

## Prompt

Work on the `dev` result branch, commit the result, do not open a pull request, use English and conventional commits, and follow the repository testing, lint, documentation, release-note, and prompt-history rules.

Implement the requested Shipyard rule: the whole footprint must be in water and touch at least one coastal land tile orthogonally or diagonally on every coastline orientation, corner, lake, and island. Give only the Shipyard a four-tile range from owned base buildings. Keep placement validation and its overlay consistent: valid footprint water is green, occupied water and every land tile are red, without changing other buildings. Apply the validator everywhere, update all documentation/tutorial references, and make enemy AI schedule and find Shipyards earlier or later according to strategy whenever a reachable coast exists, degrading gracefully otherwise. Add the requested unit coverage, run focused tests plus the required unit suite and lint, and do not run full Playwright or GPU/FPS benchmarks.
