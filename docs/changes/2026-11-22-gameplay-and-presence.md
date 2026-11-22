## Bugs

- [x] **Ammunition service audio**
  Play the reload clunk once when a magazine reaches capacity.
  Spec: none
- [x] **Street targeting**
  Skip streets during guard target acquisition and discard existing street targets.
  Spec: none
- [x] **Shared streets**
  Treat built streets as passable across parties in pathfinding and local steering, including older tiles missing the build-only marker.
  Spec: none
- [x] **Presence rate limiting**
  Wait progressively longer after repeated HTTP 429 responses and honor a longer Retry-After delay.
  Spec: none

## Improvements

- [x] **Command Center smoke**
  Remove the Command Center's chimney smoke emission.
  Spec: none

Guard scans still run once per simulation tick. At 60 ticks per second and 50 guards looking at 200 building entries, the existing scan performs at most 600,000 simple street checks per second. Local steering substitutes a shared passability check at its existing probes, and ammo updates reuse the existing loops with fewer audio calls. These are CPU operations independent of device pixel ratio. The smoke change reduces draw work at every pixel ratio. The 60 FPS check on qualifying hardware remains pending.
