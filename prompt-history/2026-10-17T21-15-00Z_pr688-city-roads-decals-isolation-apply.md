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

## Follow-up requests (same session)

- Item 7: "non-winter shrubs and trees still show up on snow tiles. Make placement strict: on snow tiles, only place props with an explicit snow tag ... make sure the code is ready to pick up a new snow-tagged optional sheet."
- Item 8: Patrick approved the winter sprite sources (`winter_shrubs`, `winter_pines`, `winter_bare_trees`, `winter_small`). Isolate them with the SSE flow keeping interior dark pixels, pack them into a new optional lossless WebP + JSON sheet at about 10 m per tile, tag them only with decorative, passable/impassable, snow and group tags, register it as optional so it is placed on snow, and verify it on a snow map.
- Bare-tree decision: "make the gaps between the branches transparent in the image itself, for only the 6 bare trees in dtv3_winter ... with a soft 1px alpha edge ... Don't touch the trunk, the branches themselves, or any other sprite. The runtime and SSE rule (never strip interior pixels) stays unchanged. Keep the file lossless WebP and the JSON unchanged."

## Round 4 requests (2026-10-17/18, same session)

- 4) inner_cuts replaces the "never strip interior pixels" rule: by default only edge-connected black background is removed; enclosed black background pixels are cut only for sprites tagged `inner_cuts` (SSE auto-isolation and runtime keying). Tag the six dtv3_winter bare trees and the decals, audit and tag the other sheets, add the tag to the SSE.
- 1) dtv2_universal: the screenshot sprite (fuel depot) and the water tower must be rare; most sprites become `ruins`, some lower-sheet sprites become `roadside` placed sparsely only on or next to roads; support the tag in the SSE and the map generator.
- 2) Remove `streets24_q90_1024x1024` and `rockCliffsMountains_64x64_1024x1024` completely without breaking anything.
- 3) Tag `rocks_64x64_1024x1024_q85` with a new `stones` tag; place stones naturally (mixed sizes, loose clusters, more near water/coasts and rocks), deterministic, with a stone-count map setting that works with Apply.
- 5) Organic city layout: one gently curved main street per city joined to the big roads, 1-4 side streets (some branching once), houses only along streets facing them, deterministic, keep HP/attack, units must still path through.

Outcome: see docs/changes/2026-10-18-pr688-round4.md; screenshots in /workspace/vfx-verify/688-r4/.

