# Prompt History

## 2026-04-14 - GitHub Copilot
I still see the enemy tanks of different parties to target each other but just standing still and not firing at each other. Maybe it has to do with the way they approach the target to get in firing range. looks to me like the tanks think they are in range and therefore stop but cannot fire becasue they actually did not sufficiently got close enough (just a guess). Dig deeper to try to fix the issue and explain your findings and guesses (also when you ruled out) and fixes to me!

## 2026-04-13 - GitHub Copilot
there is currently an issue with enemy tanks (and maybe also other units not fireing at each other when I can see that they targetted each other already (red indicator is visible when enemy unit is selected)). Find out why that is, explain it to me why it happend and fix the issue.

## 2025-11-18 - gpt-5-codex
When expanded the toggle button should be invisible.

The map should be visible where the sidebar was when collapsed! Ensure it does!

## 2025-11-17 - gpt-5-codex
In pwa mode only left, down and right scroll works correctly but not up. There is also an incorrect black bar at the bottom. Improve!

In non pwa mobile landscape all is correct now

## 2025-11-16 - gpt-5-codex
When in drag to build mode ensure the left edge of the screen gets an offset to determine when the scroll effect kicks in so the action bar and the notch protective area is taken into account for the offset.
I dont want a black bar on the left when the sidebar is collapsed. Ensure I can see the map there and make sure there is no jumping of the map and the map is not hidden behind the sidebar when expanded.

When open the sidebar should close by swiping to the left

When closed there is the button on top left but with transparent BG

## 2025-11-16 - gpt-5-codex
Make the sidebar on the left toggleable in portrait mode on mobile

## 2025-11-15 - gpt-5-codex
ensure new units only spawn at unoccupied tiles (currently the vehicle factory spawns vehicles also inside itself so on tiles that are occupied by the factory itself). when a tile that is a spawn target is occupied just take any neighbour tile instead and if all neighbour tiles of that are also occupied take their neighbour tiles and so on...

## 2025-11-12 - gpt-5-codex
Ensure enemy Ai repairs damaged building but under the same cooldown rule after an attack like for the human player. Ensure to prioritize critical buildings first when money is low.

## 2025-11-13 - gpt-5-codex
Ensure enemy AI sells buildings when out of money and having no more refinery or harvesters to build new refinery or harvesters depending on what is missing to get new money flow from harvesting

## 2025-11-11 - gpt-5-codex
Make scrolling on the minimal on mobile super smooth!

## 2025-11-13 - GitHub Copilot
align the recoil direction with the rotation of the barrel

## 2025-11-13 - GitHub Copilot
It is still not aligned: you need to rotate the barrel by 180 degrees now but make sure the barrels kick back effect is aligned accordingly as well

## 2025-11-10 - chatGPT
use public/images/map/units/tankV1_barrel.png also for the howitzer so that when the howitzer aims at a target the barrel is lifted to point into the air for a ballistic trajectory. The howitzer has no turret to turn for aiming so the entire wagon is turning into direction of the target (already implemented). Come up with a nice realistic looks transformation and animation so that the barrel will point into the same direction the grande will start to fly along as well. the mounting point on the gun barrel is 2x0y and the mounting point on the howitzer is 30x30y (based on the original image assets for the map). Ensure there is also a retreat and flash animation similar to the one of the tank and make it a bit stronger. The flash should go to both sides and not in all directions. Make sure the howitzer does not fire before it has lifted his gun barrel slowly at the target. Also ensure the howitzer does not start to drive before it has lowered its gun barrel to be parallel to ground level again. Lifting and lowering it can take up to 4s depending on how far away the target is.

## 2025-11-12 - gpt-5-codex
- Works correctly but make it about 2x faster scrolling and faster the more it is dragged to the edges bit ensure the center space does not trigger scrolling at all only the last 20px before the edges.

## 2025-11-11 - gpt-5-codex
- When in drag to build mode on mobile ensure the map scrolls slowly when dragging to the edges
2026-01-21T10:30:00Z - GitHub Copilot: Refined mobile portrait condensed build bar. Swapped toggle to left, reduced width, fixed label orientation, and ensured buttons are visible by adjusting grid/flex hierarchy.
