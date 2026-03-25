# Spec 058: Mobile Condensed Guard Action

## Summary
Add a dedicated Guard action button in the mobile portrait condensed action bar so touch users can issue guard commands without keyboard modifiers.

## Requirements
- Show a new Guard action button only in **mobile portrait + sidebar condensed** mode.
- Only show the Guard button when at least one selected unit is a friendly combat unit.
- Position the Guard button immediately left of the Repair button in the condensed action row.
- The button icon must reuse the existing desktop guard cursor SVG (`/cursors/guard.svg`).
- Tapping Guard toggles a guard command mode:
  - Active state must be visibly indicated and animated.
  - While active, the next valid friendly-unit tap applies guard to selected units.
  - After a successful guard assignment, the button returns to inactive.
- Guard mode must automatically deactivate if Guard becomes unavailable (for example selection no longer eligible or layout leaves condensed portrait).

## Implementation Notes
- Use the existing guard command path (`handleGuardCommand`) so replay logging and sound behavior remain unchanged.
- Keep desktop modifier-based guard behavior unchanged.
- Keep expanded portrait and landscape action bars unchanged.
