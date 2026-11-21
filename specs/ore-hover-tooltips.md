# Ore hover tooltips

Hovering a visible ore tile shows its crystal level, the value of the next harvest, and the total remaining value on that tile. The total includes each harvest from the current density down to level one, at 1,000 credits per level at the time of each harvest.

Hovering a seed crystal shows the seed level and total remaining harvest value of its current field. The field follows cardinal connections through ore and other seed crystals. It counts each ore tile once and gives the seeds themselves no harvest value.

The tooltip follows the mouse and refreshes during harvesting, ore growth and camera movement. It hides when the pointer leaves the canvas or moves off the ore, while dragging, and when the window loses focus.
