UTC: 2026-04-22T19-31-27Z
LLM: codex (GPT-5.3-Codex)

## Prompt
Implement a deterministic 4-bit road autotile mask generator and integrate it into the existing sprite sheet editor in my RTS game.

Context:
- This project already has a sprite sheet editor / tag editor in the build.
- Extend that editor instead of creating a disconnected prototype.
- The generator must become part of the existing editor UI and workflow.
- Keep the implementation production-usable, modular, and easy to extend later for other autotile families.

Goal:
Create an editor feature that generates a strict 16-tile 4-bit road mask sheet for a 2D RTS game, previewable and exportable from the sprite sheet editor.

Core spec:
- Output sheet size: 1024x1024
- Grid: 16 columns × 16 rows
- Tile size: 64x64
- Total visible result must be exactly 1024x1024
- Only the minimum required tiles should contain generated content
- After all required patterns are covered, the remaining tiles must stay pure black

Autotile logic:
Use a strict 4-bit edge connectivity model:
- top
- right
- bottom
- left

Each edge is either:
- 1 = connected
- 0 = not connected

This gives 16 unique combinations total.
Generate each combination exactly once.
Do not repeat any connectivity pattern in the generated base sheet.

Bit ordering:
- define and document one exact bit order in code
- use it consistently everywhere
- expose it in the editor UI so I can inspect tile index ↔ bit pattern mapping

Geometry rules:
- roads are white on black mask
- black background = empty
- connected edges must reach the exact center of the corresponding tile edge
- on connected edges, the road must touch the tile border directly with no fade
- on non-connected edges, the road must fade smoothly into black before reaching the border
- road width must be consistent across all 16 generated patterns
- road width should be as wide as possible while still leaving enough room for non-connected edges to fade cleanly
- geometry must strictly follow connectivity, not artistic interpretation

Pattern rules:
- 0000 = empty / nearly full black
- one connected edge = cap
- two opposite connected edges = straight
- two adjacent connected edges = 90-degree corner
- three connected edges = T-junction
- four connected edges = cross

Important:
- No duplicated shapes
- No decorative variants in the base generator
- No random noise in the base mask output
- No circular blob-like shapes
- No edge mismatches
- No antialiasing that breaks the topology
- Use deterministic rendering, not randomness

Implementation requirements:
1. Add a new generator module for procedural autotile mask generation
2. Integrate it into the existing sprite sheet editor UI
3. Add a panel with:
   - generator type selector
   - tile size
   - sheet columns/rows
   - road width slider
   - fade distance slider
   - corner radius / smoothing slider if useful
   - bit order display
   - tile index inspector
   - regenerate button
   - export button
4. Add a preview canvas inside the editor
5. Add per-tile overlay/debug labels that can be toggled:
   - tile index
   - bit pattern, e.g. T1 R0 B1 L0
6. Add click selection on tiles in the preview to inspect their connectivity
7. Add export options:
   - PNG mask export
   - WebP export if the existing pipeline already supports it
8. Keep the generator reusable so later I can generate other autotile masks, not only dirt roads

Rendering requirements:
- Use the project’s existing rendering/editor conventions where possible
- Keep generated output crisp and aligned to the tile grid
- Ensure each tile is exactly 64x64 logical pixels in the exported result
- No accidental scaling to non-target dimensions
- Final exported sprite sheet must be exactly 1024x1024

Architecture expectations:
- Reuse existing editor/state patterns where sensible
- Keep pure generation logic independent from UI
- Separate:
  - connectivity model
  - tile geometry builder
  - rasterization
  - editor integration
  - export pipeline

Suggested API shape:
- generateRoadAutotileMaskSheet(config)
- generateRoadAutotileMaskTile(bitmask, config)
- bitmaskToConnectivity(bitmask)
- connectivityToDebugLabel(connectivity)

Validation:
Implement automated validation checks in code:
- verify there are exactly 16 generated unique connectivity patterns
- verify no pattern is duplicated
- verify connected edges touch the correct tile border center
- verify non-connected edges do not accidentally reach the border
- verify export dimensions are exactly 1024x1024

Editor UX:
- Make it easy to regenerate after changing width/fade/smoothing
- Show the first 16 tiles as the generated base set
- Keep all remaining tiles black
- Make debugging obvious and visual

Deliverables:
- integrated feature in the sprite sheet editor
- clean code with comments in non-obvious places
- any required small UI additions
- export working end-to-end
- short developer note in the relevant docs or code comments explaining the bit order and generation rules

Do not:
- do not create a disconnected demo page unless the project architecture truly requires it
- do not use AI generation for the mask geometry
- do not generate repeated variants
- do not invent extra road styles in this task

After implementation:
- summarize which files were changed
- explain the bit order used
- explain how to use the new editor feature
- mention any assumptions you had to make
