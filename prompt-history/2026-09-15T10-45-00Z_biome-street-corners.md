# 2026-09-15T10:45:00Z

Model: GPT-5; harness: Codex desktop. Exact model build, reasoning level, token counts and elapsed task telemetry are unavailable.

## Request

Analyse the attached images to see the same issue also on land to land tile from different intersections of biomes or with streets. Ensure to apply the same/similar fix.

Images inspected:

- `codex-clipboard-acf151b8-7d3a-4f08-8afc-83e989ac3ffe.png`: dark biome meeting sand with stepped edges and small detached corner notches.
- `codex-clipboard-d46a6b9e-ea29-4e1c-9c61-8e4631a8b74f.png`: road/cliff/sand intersections with isolated triangular sand gaps along the asphalt edge.

## Result

Extended the shared-junction transition system from water shores to land-to-land biome borders and street fringes. Biome transition masks now agree at shared corners, and road fringe art uses a bounded cached road sample clipped by the same corner field. Integrated sprite-sheet biome transitions receive the same corner mask.

Validation: 3,927 unit tests passed; the full organic terrain browser suite passed 10/10; the focused biome/street browser test passed; lint and `git diff --check` passed. DPR-2 benchmark: 43.73 FPS, 2.56 ms update, 8.38 ms render, 7.22 ms terrain, 64.85 MiB heap. Prior baseline: 43.65 FPS. Exact model build, reasoning level, token counts and full task elapsed time are unavailable, so they are not estimated.
