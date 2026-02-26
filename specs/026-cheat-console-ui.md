# Cheat Console UI Alignment

## Goal
- Update the cheat console modal to share the same visual styling as the settings menu modal.

## Requirements
- Use the settings modal visual system (overlay, dialog surface, header, and button styling) for the cheat console.
- Keep cheat command input and help list content intact.
- Ensure the cheat console still blocks gameplay input while open and restores state on close.
- Keep vertical scrolling available while hiding native scrollbars, and prevent horizontal scrolling in the cheat console.

## Implementation Notes
- Reuse `config-modal` classes from `styles/overlays.css` for the overlay and dialog elements.
- Use `config-modal__field`, `config-modal__actions`, and `config-modal__button` styles for input and actions.
- Add minimal cheat-specific styles only for spacing, hidden scrollbars, and help list presentation.

## Command Updates
- Added `build [type] [party]` cheat command support to spawn buildings near the cursor for fast test/setup workflows.
- Building spawn applies immediate placement to the map grid, occupancy map, and building list, then refreshes power supply state.

- Added `xp [amount]`, `xp +[amount]`, and `xp -[amount]` cheat command support to set absolute XP or apply relative XP adjustments for selected combat units.

- Ammo cheat help text now documents absolute and relative forms (`value`, `percent%`, `+/-value`, `+/-percent%`) and clarifies it applies to selected units and ammo-bar buildings.
- `ammo` command now supports absolute and relative adjustments for both unit ammo pools (`ammunition`/Apache `rocketAmmo`) and building ammo reserves (`ammo` with `maxAmmo`).

## Command History
- Cheat input now supports keyboard history navigation via `ArrowUp` (older commands) and `ArrowDown` (newer commands / draft restore).
- Command history persists in `localStorage` under `rts-cheat-console-history` so it survives reloads.
- History length is capped by configurable runtime config `CHEAT_CONSOLE_HISTORY_LIMIT` (default `10`).
- Entered commands are appended to history after execution, with oldest entries dropped once the cap is reached.
