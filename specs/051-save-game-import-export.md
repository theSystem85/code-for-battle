# Spec 051: Sidebar Save Game Import/Export

## Goal
Enable players to share save games by exporting local saves as JSON files and importing JSON save files from disk.

## Requirements
1. Add an import icon button next to the existing save button in the sidebar Save/Load section.
2. Import flow opens the native file picker restricted to JSON files.
3. Imported save JSON is validated and persisted into localStorage using the same save format used by local saves.
4. In the save list rows, replace the old load/play button with an export icon button for non-mission saves.
5. Exporting triggers file download of JSON containing save metadata + state.
6. Export filename includes save label and save date/time.
7. Save label in each row becomes the load trigger (clickable control) and loads the save.
8. Built-in mission rows remain non-exportable/non-deletable but can still be loaded from label click.

## Validation
- E2E covers create save -> export -> delete -> import -> load from label behavior.
- Lint and changed-file checks pass.
