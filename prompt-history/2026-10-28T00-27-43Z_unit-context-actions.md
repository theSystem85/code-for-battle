UTC: 2026-10-28T00-27-43Z
Model: GPT-6 (Codex harness; exact runtime revision, reasoning level and token accounting unavailable).

User request:

for naval units ensure the user has to exactly click the units rendered image instead of a circular area around the units (like a round bounding box). Make sure to use a clickable mask that is equal in size, position and rotation to each units image asset. also ensure that the supply ship when selected shows the move into cursor when user hovers over a unit that can consume service instead of the guard cursor. ensure when user clicks on the target unit that it will be served instead of guarded. when user tap/click holds onto another unit the circle menu will show up (btw. reduce the time for circle menu to show up in general to 500ms and ensure the selected option get triggered on release (not on 2nd click) like it already works with circle menu over buildings). The circle menu over units will show:
1) attack or force attack when friendly unit
2) guard (for friendly units)
3) serve (for friendly units)
4) follow (for any units, it is a new mode you have to implement)
5) optional: land on (only for air units on a carrier)
6) optional: embark (only for ground units on ferry or hovercraft)

let me know if I forgot something that would fit into that context as well.
