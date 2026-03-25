# Spec 051: Sidebar Save Game Import/Export

## Goal
Enable players to share save games by exporting local saves as JSON files and importing JSON save files from disk.

## Requirements
1. Add an import icon button next to the existing save button in the sidebar Save/Load section.
2. Import flow opens the native file picker restricted to JSON files.
3. Imported save JSON is validated and persisted into localStorage using the same save format used by local saves.
4. The same import button also accepts exported replay JSON files and persists them into replay storage.
5. In the save list rows, replace the old load/play button with an export icon button for non-mission saves.
6. Exporting triggers file download of JSON containing save metadata + state.
7. Export filename includes save label and save date/time.
8. Save label in each row becomes the load trigger (clickable control) and loads the save.
9. Built-in mission rows remain non-exportable/non-deletable but can still be loaded from label click.
10. Export and import icons render correctly (no fallback glyph boxes).
11. Import file picker allows selecting multiple JSON files in one action.
12. Single-file save import auto-loads the imported save immediately.
13. Single-file replay import auto-loads the imported replay immediately.
14. Multi-file import imports all selected save/replay files and does not auto-load any entry.
15. The import button tooltip reads "Import save game or replay".
16. Export filename order is timestamp first, then save label.
17. Save-game exports and replay baselines must include the full loaded map settings and static resource-tile state so later import/load cannot inherit ore layout or map configuration from another session.

## Validation
- E2E covers create save -> export -> delete -> import -> load from label behavior.
- Lint and changed-file checks pass.
