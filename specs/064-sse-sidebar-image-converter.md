# SSE sidebar image converter

## Summary
Add an expandable section at the bottom of the main sidebar that converts locally dropped images into `.webp` files and immediately downloads the converted output.

## Requirements
1. The converter is housed in a dedicated expand/collapse panel in the bottom sidebar area.
2. The converter supports drag-and-drop uploads (and optional file picker fallback) for `.png`, `.jpg`, `.jpeg`, and `.webp` sources.
3. Conversion is local-browser only (canvas-based) with no server upload.
4. Default conversion settings:
   - Compression quality: `90%`
   - Target resolution: `1024x1024`
5. The converter exposes exactly three numeric inputs:
   - Compression (%), range `1-100`
   - Width (px), range `1-2048`
   - Height (px), range `1-2048`
6. Converted files are downloaded immediately after each successful conversion.
7. Output filenames preserve the original base filename and use `.webp` extension.
8. A checkbox allows appending conversion suffixes to filename as `_q<compression>_<width>x<height>`.

## UX Notes
- Show concise status text for success/failure.
- Highlight drop-zone affordance while dragging files over it.
