# Spec 043: Expanded Sidebar Action Button Style Alignment

## Summary
Align expanded sidebar action buttons with the settings-button visual language by removing button borders, enforcing square dimensions, and spacing buttons inside a flex container with visible separation.

## Requirements
- Expanded sidebar action buttons must render without visible borders.
- Expanded sidebar action buttons must be square (equal width/height).
- The expanded sidebar actions row must use a flex layout with spacing between buttons.
- Hover behavior should not reintroduce border-like outlines.
- Expanded sidebar `Repair` and `Sell` active states must remain clearly visible, using the same green highlight language as condensed sidebar actions.

## Implementation Notes
- Apply style updates in mobile portrait expanded sidebar selectors (`body.mobile-portrait #actions` and `body.mobile-portrait #actions .action-button.icon-button`).
- Keep condensed/collapsed portrait action styling unchanged.
