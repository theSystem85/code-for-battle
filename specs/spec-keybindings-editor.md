# Spec: Key Bindings Editor Modal

## Overview
- The sidebar gear button opens a tabbed settings modal with a **Key Bindings** tab and a **Runtime Config** tab (plus benchmark trigger).
- The Key Bindings tab lists keyboard, mouse, and touch bindings grouped by context (in-game, map edit enabled, map edit disabled) with section headers stacked vertically (no horizontal inset padding) and a scrollable body for long lists.
- Non-default bindings are highlighted with a subtle yellow tint.
- Modal open/close is handled through shared helpers so the sidebar button reliably launches the modal.
- Runtime actions (open runtime config dialog, run performance benchmark) live inside the modal instead of the sidebar.

## Interaction
- Clicking a binding enters capture mode and records the next keyboard combination, mouse click (including modifier keys and double-click), or touch gesture (tap, double tap, or double-finger tap).
- Custom bindings persist in `localStorage` under the `rts-custom-keybindings` key and are immediately used by the keyboard/mouse handlers.
- Export/Import buttons save or load bindings as JSON that includes app version and commit hash for traceability.

## Runtime behavior
- Keyboard shortcuts in `keyboardHandler` resolve against the keybinding manager so remaps take effect without reloads.
- Mouse selection/command handling consults the same manager to honor remapped primary/secondary clicks while keeping spectator safeguards.
- Map edit mode toggling is exposed as a binding and updates the shared `gameState.mapEditMode` flag for context-aware grouping.
- The `i` keyboard shortcut and the sidebar info (`ℹ️`) action both open the same settings modal directly on the **Key Bindings** tab.
- The legacy standalone "Game Controls" modal is removed so keybinding/help discovery is centralized in one settings surface.
