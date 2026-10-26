# 2026-10-26T13:55:18Z — Jank-free map scrolling

Model: Codex using GPT-5.6 Sol
Harness: Codex

## Prompt

Work on the `dev` result branch, follow repository instructions, use conventional commits, and do not open a pull request. Investigate map scrolling, camera panning and inertia, sprite preparation, and rendering. Keep player buildings, units, basic grass/sand/soil/snow/water/road terrain, rocks, and cliffs immediate. Deprioritize every decorative sprite under main-thread scroll pressure so it catches up only when capacity permits. Add an optional Graphics Settings fade-in toggle whose state does not control whether decorations eventually load. Run lint and only focused tests for touched files; do not run the full end-to-end suite. Add change documentation, an unreleased feature entry, and unique prompt history naming Codex.
