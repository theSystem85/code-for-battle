# 2026-07-25T20:52:37Z

Processed by: Codex

1) isolate the images of the turrets from the battle ship so that they can be drawn independently on the battleship and rotate towards target (like tank's wagon and turret can rotate independently from each other towards their individual target).

2) also separate the gun barrels of each turret so that they can move back during recoil and show a muzzle flash when they fire (look at how it is done for tanks and do it similar, maybe reuse code)

3) ensure the battle ship turns its side to the target to fire a broadside. Ensure the turrets cannot fire when blocked by the center control tower of the ship (show visual indicator angles where each turret can freely fire at and where it is blocked by the central tower.

4) a broadside of the ship would fire in this kind of pattern: 300ms between each barrel of a turret. each turret fires with 1s delay to the previous one. the entire ship will take 8s to reload all turrets for the next broadside.

5) update the battleships base map image asset to show empty turret holes so that the turrets can be rendered on top independently and when they are destroyed show that holes only.

6) increase the fire range of the battleship by 50%.

7) when a ship is sinking ensure the animation shows it so that it sinks staring from one side (front down, back down, left down, right down) with each 25% likelihood.

8) ensure all ships but the submarine can also attack every building or unit on land when in range. ensure submarines can only attack buildings that are partly in the water like yard.
