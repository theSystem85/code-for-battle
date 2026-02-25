# Prompt History Entry

- UTC Timestamp: 2026-02-25T10:20:00Z
- LLM: copilot

## User Request Summary
Follow-up fixes and features:
1. Adjust F22 spawn orientation and parking slot placement offsets/alignment.
2. Add configurable debug hotkey to cycle unit/building image opacity (50% then 0%).
3. Fix airstrip non-passable no-go rectangle to top-left source-space bounds.
4. Render build-only street tiles in yellow in occupancy overlay.

## Implementation Notes
- Updated F22 parking slot source coordinates and facing values in `airstripUtils.js`.
- Added keyboard action `toggle-entity-opacity` (default `Y`) with keybindings editor compatibility.
- Added `entityImageOpacityLevel` game state and applied image alpha in renderer base-pass.
- Updated airstrip blocked rect logic to `(0,0)`..`(470,148)` source coordinates.
- Extended occupancy map rendering to highlight build-only street tiles in yellow.
- Updated TODO and spec documentation.
