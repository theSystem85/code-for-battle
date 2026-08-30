# Spec 051: Sidebar Save Game Import/Export

## Goal
Enable players to share efficient compact saves while retaining legacy JSON conversion for debugging.

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
18. New browser saves use the versioned, whitespace-minimal `CFB2` relational format by default; CFB files contain no JSON envelope or repeated per-row property names.
19. CFB emits one schema line per entity type followed by compact rows, grouping units by unit type and covering buildings, wrecks, decals/map palette entries, ore, mines, and every other serialized dynamic collection.
20. Compact maps store a tile palette table plus row-major run lengths and omit the redundant `mapGridTypes` and `orePositions`; loading reconstructs all three legacy views.
21. Map Settings offers Compact CFB and Legacy JSON export choices, remembers the choice, and uses exporting as a bidirectional converter.
22. Import accepts `.cfb` compact saves, version-one compact JSON saves, and legacy `.json` saves/replays.
23. A representative 200×200 uniform-map compact serialization must be under one tenth of the corresponding legacy serialization.
24. Unit rows preserve paths, current/queued user commands, primary and attack targets, and multi-target command IDs; planning blueprints and production build stacks remain serialized.
25. Map Settings opens a separate Save Game Editor modal with editable JSON and relational-table views, a read-only map boundary, file byte/character/line metrics, and confirmed overwrite or save-as-new actions.
26. The editor includes a Strategic LLM Preview tab showing the filtered, tabular context shape that would be transferred to a strategic model.
27. The Save Game Editor must visually match the Settings modal: dark overlay, dark panel and workspace, gradient header, blue active-tab/primary-action accents, consistent typography, fields, focus states, spacing, borders, and responsive mobile layout.

## Validation
- E2E covers create save -> export -> delete -> import -> load from label behavior.
- Lint and changed-file checks pass.
