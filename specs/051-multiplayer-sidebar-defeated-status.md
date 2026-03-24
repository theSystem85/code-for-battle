# 051 - Multiplayer sidebar defeated status

## Summary
Add defeated-state visibility to the multiplayer party overview in the sidebar so hosts and spectators can immediately identify eliminated players.

## Requirements
- The multiplayer party list must display `Defeated` for any party present in `gameState.defeatedPlayers`.
- Defeated status should override invite/availability/reconnect text.
- Defeated status should have distinct styling from normal and success statuses.
- Sidebar status should refresh as defeat data changes during runtime.
- Defeat detection must normalize legacy owner id `player` as `player1` so initial mission loads do not mark the green local player as defeated when their assets still use legacy ownership.

## Validation
- E2E: set `gameState.defeatedPlayers` for a party and verify that party row shows `Defeated` and the defeated status style class.
- Unit: `checkGameEndConditions` should keep `player1` alive when surviving structures are owned by legacy `player`.
