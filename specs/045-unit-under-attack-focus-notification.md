# Spec 045: Unit Under-Attack Focus Notification

## Summary
Add a notification when a player-owned unit (non-base) is attacked by an enemy. The notification includes a clickable unit type link that selects the attacked unit and smoothly focuses the camera on it.

## Requirements
- Trigger only when attacker is enemy-owned.
- Keep existing base/harvester voice notifications unchanged.
- For player-owned units that are not base structures, display a notification with:
  - Message: `<Unit Type> is under attack!`
  - Inline clickable unit type element.
- Clicking the inline unit type must:
  - Select only that unit.
  - Clear existing unit/factory selections.
  - Smooth-scroll camera to the unit center.
- Add per-unit cooldown throttling to reduce spam.

## Notes
- Notification history should receive plain text fallback without inline controls.
- Unit type display should be human-readable (e.g. `tank_v1` -> `Tank`).
