# 2026-03-24T18:45:00Z - codex

## Prompt
Looks like the enemy ai commands are not recorded correctly or not replayed correctly. Here is the file attached of the 14min replay where the enemy AI should have build a big base and commanded a bunch of units but when I load the replay I can only see my own base develop and the enemy is almost doing nothing. Find the cause for the problem and fix it! Ensure every enemy ai base build command and unit command is recorded in the same way like it is for human player. Also ensure it would work the same way in a 4 player game no matter which party is controlled by humans or AI. Full replay with all actions recorded should always be possible.

## Investigation
- Summarized the attached 14-minute replay JSON and confirmed it only contained human-side commands plus non-owner utility events.
- Verified the replay had no enemy-owner commands at all, which explained why replay only reconstructed the local player base and depended on live AI reruns for the enemy side.
- Traced the classic AI path and found that enemy building placement, enemy unit spawning, and enemy unit order changes were mutating runtime state directly without writing replay commands.
- Traced the host multiplayer command path and found remote-party building/unit actions also bypassed replay recording.

## Changes
- Added replay recording for classic AI building placements at construction completion.
- Added replay recording for classic AI unit spawns with stable replay unit references.
- Added replay recording for classic AI unit-order transitions by diffing high-level AI command state after unit updates.
- Added replay execution support for recorded AI/remote-party building placements and unit spawns.
- Added replay recording for host-applied remote-party building placement, movement, attack, stop, and unit spawn commands.
- Disabled live AI updates during replay so playback follows the recorded command log instead of rerunning fresh AI decisions.
- Updated replay feature tracking docs.

## Validation
- Checked editor diagnostics for all changed replay/AI/network files.
- Ran `npm run lint:fix:changed` successfully after the AI replay capture fix.
