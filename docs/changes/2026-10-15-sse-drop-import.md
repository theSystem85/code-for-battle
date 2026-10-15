- [x] **Bugfix: Sprite Sheet Editor file drop (#648)**
  Dropping files onto the SSE canvas now accepts images by extension when the MIME type is empty, processes multi-file drops image-first and then JSON tags (regardless of drop order), and only applies tag JSON to a loaded sheet; JSON alone without a sheet still warns.
  - Spec: `specs/2026-10-15-sse-drop-import-parity.md`
  - New E2E `tests/e2e/spriteSheetEditorDrop.test.js` (real `DataTransfer` drop events). It passes with the fix; against the old handler 3 of 4 cases fail (empty-MIME .png/.webp, image + JSON).
  - New unit test `tests/unit/spriteSheetEditorDrop.test.js`.
  - Version 0.53.1.
  Visual check: Playwright headless Chromium screenshot after image + JSON drop shows the dropped sheet with the imported tag on tile 0,0.
