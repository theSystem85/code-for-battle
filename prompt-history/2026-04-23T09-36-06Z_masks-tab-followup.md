UTC: 2026-04-23T09-36-06Z
LLM: codex (GPT-5.3-Codex)

## Prompt
The user was unsatisfied with the previous SSE road autotile generator implementation and requested follow-up changes:
1) no sidebar preview; immediate updates on the big canvas
2) debug labels on big canvas overlay
3) info bubble explaining debug label codes
4) put all autotile generator UI under a new `Masks` sidebar tab
5) fade should affect only sides of road parts, not endings
6) group pattern rotations by columns (e.g., all T-junctions in one column)
7) add a full-texture no-fade tile for fully connected inner street usage
8) add a separate column with 4 full-tile single-edge-fade parts (one fading edge per tile)
