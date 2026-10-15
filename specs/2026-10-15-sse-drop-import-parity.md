# Spec: SSE drop import parity for image + JSON assets

## Scope
- Preserve SSE drag-and-drop support for both sprite sheet image imports and JSON tag metadata imports.
- Support mixed drops where users drop multiple files (image + JSON) together.

## Requirements
1. SSE canvas drop accepts image files (`.webp`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.avif`) even when MIME is missing or generic, by falling back to extension checks.
2. SSE canvas drop accepts JSON metadata files by MIME or `.json` extension.
3. If both image and JSON files are dropped together, SSE must:
   - Load the image first (creating/loading the sheet in the active mode).
   - Then apply dropped JSON metadata to the now-active sheet.
4. Dropping only JSON should continue to apply tags to the currently loaded sheet and should still warn if no sheet is loaded.
5. Dropping unsupported file types should show the existing import warning.

## Tests
- E2E: `tests/e2e/spriteSheetEditorDrop.test.js` dispatches real `DataTransfer` drop events for an image with MIME type, `.png`/`.webp` with an empty MIME type, and image + JSON together (JSON listed first).
- Unit: `tests/unit/spriteSheetEditorDrop.test.js` covers type detection, JSON without a loaded sheet, and unsupported files.
