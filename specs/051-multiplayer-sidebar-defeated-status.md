# 051 - Multiplayer sidebar defeated status

## Summary
Add defeated-state visibility to the multiplayer party overview in the sidebar so hosts and spectators can immediately identify eliminated players.

## Requirements
- The multiplayer party list must display `Defeated` for any party present in `gameState.defeatedPlayers`.
- Defeated status should override invite/availability/reconnect text.
- Defeated status should have distinct styling from normal and success statuses.
- Sidebar status should refresh as defeat data changes during runtime.

## Validation
- E2E: set `gameState.defeatedPlayers` for a party and verify that party row shows `Defeated` and the defeated status style class.
