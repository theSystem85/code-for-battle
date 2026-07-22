UTC timestamp: 2026-07-22T19:55:20Z
LLM: codex

# Prompt

1) regarding tooltip for ferry load: ensure that the different units loaded are listed with a new line each
2) there is a bug when a loaded ferry reaches a point at water it goes back and forth very quickly instead of just stopping. fix that!
3) ensure that the ship yard can also be build on the east and west shore when overlapping 2 straight columns with land tiles are given
4) ensure map settings also have an input for start money for each party
5) ensure all ships but the submarine render 50% larger
6) ensure F22 and F35 render 50% smaller when landed on carrier
7) improve landing and start animation of jets on carrier (no rapid movements but smooth animations)
8) ensure when ferry embarks and disembarks that it turns its tail to the shore and units only start to move on/off board when ship has target alignment. Also ensure there is an animation that shows units moving on and off the ship (currently it happens instant). during the on/off load process ferries should not be movable.
9) when loaded ferry is selected an player hovers over land show "move-into" cursor. when clicked on land all loaded units will disembark and move to that point on land that was clicked and gather around that point.
10) ensure enemy AI actually uses its own ships to attack player. currently I saw they build a destroyer but did not attack even when being attacked.
11) ensure there is a 50% likelyhood an enemy AI party will build airstrip with jets before buildings yard with ships and vice versa. So each party could either prefer a naval first or an airforce first strategy.
12) ensure enemy AI uses supply ships when needed or returns heavily damaged ships or those that ran out of ammo, crew back to yard.
14) ensure naval units have the same collision detection as ground units so that they accurately prevent each others map images from overlapping with each other as well as with the shoreline (ensure to implement it very performantly!)
15) ensure the ships move with some inertia so they have to get slower before they reach target position and fully stop. Same for their rotation. they have to rotate with ease in and out animation.
16) make a todo list or specs with todo list for alle these requirements and do as much as you can. If you see room for improvements feel free to add suggestions to that todo list and let me know if we can continue with some points later on.
