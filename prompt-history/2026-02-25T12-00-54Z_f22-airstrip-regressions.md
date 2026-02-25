# Prompt History
- UTC: 2026-02-25T12-00-54Z
- LLM: copilot

## Prompt
more issues to fix:
1) all spawning points still need to be shifted up by 32 px (means lower y coord by 32px)
2) I still see street tiles rendered below the airstrip building. Ensure the street tile is only logically there but not visually. the airstrip itself is logically treated mostly as a street be be movable but the game should not render extra street tiles below the airstrip!
3) when multiple F22 are commanded to take off or land at the same time ensure there is a queue that manager all incoming and outgoing units so they start and land one at a time.
4) when F22 is in starting process ensure that it accelerates from start to liftoff and takeoff point with ease in (same holds for landing but in reverse). Also ensure after lift off point is reached that the gain in height is also gradually untill full height is reached (indicated by distance of F22 to its shadow).
5) ensure that F22 in air do not have any collision detection (it is like they fly at different heights) so they just overlap
6) ensure the F22 when attacking does not hover exactly over the target to attack but flies in waves around it to attack it
7) the F22 when attacking is STILL only firing a singe rocket instead of a burst of multiple rockets => Think harder to fix that problem now!
8) Ensure a single rocket of the F22 is powerful enough to destroy a tank_v1 with 2 direct hits (make sure to use a dedicated rocket for the F22 and do NOT change the stats of other rockets)
