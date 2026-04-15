# Map Settings expand scroll alignment

## Summary
When the user expands **Map Settings** in the sidebar, the auto-scroll behavior must reveal the **start** of the expanded section, not the bottom of it.

## Requirements
1. Expanding `#mapSettingsContent` must not auto-scroll to the end of the section.
2. If the expanded content is outside the sidebar viewport, sidebar scroll should align the top of map settings near the top of the visible area (small padding allowed).
3. Existing collapse/expand toggle behavior (`aria-expanded`, icon state, and display toggling) remains unchanged.

## Acceptance criteria
- Given Map Settings is collapsed and positioned partly below the current sidebar viewport,
  when the user expands it, then the first controls in Map Settings are visible at the top of the sidebar viewport.
- Given Map Settings is already fully visible, when expanded, no unnecessary scroll jump occurs.
