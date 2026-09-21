# 2026-09-15T02:18:46Z — South cliff shadows

Codex. The exact model version, reasoning level, token counts, and total task duration were not available.

## User request

Increase the shadow length/size on the grounds before cliffs facing south. Ensure there are no north facing shadows for cliffs.

## Implemented outcome

- Increased the south-facing horizontal cliff ground shadow from 22px to 44px in the baked atlas source geometry.
- Removed north-facing macro shadows and restricted curved/diagonal cast shadows to south-facing normals.
- Regenerated the quality-85 WebP cliff atlas and updated the terraced-cliff specification.
