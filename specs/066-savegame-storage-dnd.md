# 066 - Savegame storage quota UX and map drag/drop import

## Goals
- Allow loading exported save JSON files by dragging and dropping them directly onto the game map canvas.
- Show richer save-list hover information for local saves:
  - current save file size
  - remaining local storage capacity before quota is exceeded
- Handle localStorage quota-exceeded failures gracefully during save attempts:
  - catch browser quota errors
  - disable the local-storage Save button while quota remains exceeded
  - show a tooltip on the disabled Save button explaining the reason
  - show a notification that also explains export/import + drag/drop workflow
- Add a direct **Download Save** action beside the existing Save button that exports the current game to JSON and bypasses localStorage writes.

## Functional requirements
1. **Map drag/drop load**
   - The game canvas accepts dropped files.
   - Dropped JSON save/replay files route through the same import pipeline as the import file input.
2. **Save-list tooltip details**
   - For each non-builtin save row, the hover tooltip includes:
     - save file size in MB
     - remaining local storage in MB
3. **Quota-exceeded save behavior**
   - Quota errors from `localStorage.setItem` are detected via browser-compatible quota error signatures.
   - Save action is disabled after a quota-exceeded failure.
   - Save button remains disabled until storage is writable again (e.g., deleting saves).
   - User receives an explanatory notification including the fallback workflow.
4. **Direct download button**
   - A dedicated button in Save/Load controls exports the current game to a file immediately.
   - This action does not depend on localStorage quota.

## Non-goals
- Cloud save sync.
- Binary compression of save payloads.
