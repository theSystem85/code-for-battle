# Spec 060: Harvester Automation Policy

## Summary

Harvesters must follow one shared automation policy for both player-owned and AI-owned units, with only one explicit enemy-only branch: retreating from attacks before resuming the economy loop.

## Requirements

1. Player-issued harvester commands are the highest-priority owner of movement intent.
2. A player move to a non-ore tile must interrupt harvesting/unloading, move the harvester to that tile, and leave it idle there until the player issues a new command.
3. A player command to an ore tile must interrupt harvesting/unloading, move the harvester to that ore tile, and then hand off into the normal automated harvest -> unload -> harvest loop, but only if that ore tile is valid for the harvester's current XP-vs-density permission.
4. Newly produced harvesters must automatically acquire a reachable ore target, receive immediate movement intent toward it, and enter the standard harvest loop when no player rally/override exists.
5. A harvester with an assigned refinery must prefer that refinery for unloading and stuck recovery; alternate refineries are only valid when no assigned refinery is available.
6. Enemy-only: when an enemy harvester is attacked, retreat behavior takes control immediately, clears economy routing while retreating, and resumes the harvest loop once retreat ends. AI retreats use path-based forward movement and must NOT be processed by the player backward-movement retreat system (`updateRetreatBehavior`). The post-retreat cooldown must always be checked before nearby threats to prevent immediate re-trigger loops.
7. Shared stagnation recovery must use goal progress, not just “has path” or “has moveTarget”.
8. A harvester is considered productive only while harvesting, unloading, or successfully making progress toward its current ore/refinery goal.
9. If a harvester spends more than 60 seconds without meaningful progress toward its ore goal, it must retarget to a pseudo-random reachable ore tile whose refinery distance is similar to the stalled target’s refinery distance.
10. The automation policy must prevent permanent idle-on-ore and reroute-loop states for both player and enemy harvesters.
11. When multiple selected harvesters are commanded to one ore tile, they must fan out across unique reachable ore tiles from that connected ore field before any target tile is reused.
12. Manual ore commands and any transition into active harvesting must reject ore tiles above the harvester's current density permission, immediately clear stale invalid manual targets, and fall back to a valid automatic ore target instead of looping on the invalid tile.
13. When exactly one harvester is selected and the player commands an ore tile, that harvester must preserve the exact clicked ore tile as its manual target instead of retargeting to a different nearby tile from the same field.
14. A single harvester manual ore command must only hand off into harvesting after the wagon reaches the clicked tile itself; the generic adjacent-to-ore arrival tolerance used for automatic harvesting must not let it stop on a neighboring ore tile.
*** Add File: /Users/hella/Documents/projects/gemini-rts-game/prompt-history/2026-04-20T20-22-21Z_finish-without-e2e.md
# 2026-04-20T20-22-21Z
# Model: copilot

## Prompt
finish up but do NOT run the e2e tests now

## Notes

- `havester-policies.md` is the operator-facing reference that visualizes this policy.
- This spec intentionally separates player command ownership from enemy retreat ownership so only one subsystem controls a harvester at a time.
