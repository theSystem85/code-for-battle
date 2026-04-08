UTC: 2026-04-08T10:56:52Z
LLM: codex (GPT-5.3-Codex)

Prompt:
Implement shoreline smoothing by generating a feathered shoreline mesh along land-water borders.

Requirements:
- Analyze the terrain grid and trace coastlines where land meets water
- Generate a thin mesh strip along each coastline
- Render the shoreline mesh after terrain, using a texture with soft alpha feathering
- The mesh should visually soften sharp tile intersections and diagonal shoreline steps
- Rebuild shoreline mesh data only when nearby terrain changes
- Store/generated data per chunk where possible
- Keep rendering efficient for large RTS maps
- Add a debug mode that displays the generated shoreline mesh lines and triangles

Implementation notes:
- Do not use fullscreen postprocessing
- Do not modify unrelated terrain tiles
- Use stable chunk-border logic so coastlines do not break visually between chunks
- Favor simplicity and robustness over mathematically perfect contour extraction
- The goal is a soft visual coastline with minimal runtime cost
