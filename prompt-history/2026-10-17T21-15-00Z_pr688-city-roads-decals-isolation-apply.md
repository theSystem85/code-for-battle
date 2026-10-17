UTC timestamp: 2026-10-17T21:15:00Z
Processing date: 2026-10-17 (Europe/Berlin)
Harness: Grok Bot executor on the shared box (not Codex). Token accounting and exact duration are unavailable and omitted.

User request (Patrick, English):

now rebase 688 on main (but do not merge yet) and then fix these issues:
1) city buildings need to have 10x less HP (health points)
2) user can attack them without need to use force attack
3) houses in cities need to be on a road (so add streets between the houses) and these streets need to be connects to the large ones the map already provides!
4) ensure decals do not render on houses (just do not render decals when impact was on a building (so only render decals on passable tiles)
5) when a sprite is isolated automatically from a source image ensure that never any pixels from the inside of the sprite (like dark or black pixels) get stripped away! Also ensure the same thing for the algorithm that places the sprites from the final sprite sheet on the map during game rendering!
6) ensure when map properties are changed in the sidebar that the map does not immediately rerender but an apply button gets shown and enabled as soon as changes were detected.

Outcome: rebased onto main 0.60.0 as 0.61.0, then one conventional commit per fix. See docs/changes/2026-10-17-pr688-round3.md.
