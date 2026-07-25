# Naval and domain-production follow-ups

## Scope and acceptance criteria

1. Ground, naval, and air units have independent production queues and can build concurrently.
2. Ship collision broad-phase uses the spatial quadtree and narrow-phase uses rotation-aware capsule hulls. Coincident centers must still collide, and a ship must exclude itself from candidate checks.
3. Hovercraft pathfinding and collision permit land and water while other ships remain water-only.
4. Each jet takeoff or landing transition emits its sound once.
5. Remote naval control uses a persistent zero-to-one throttle: Up increases it to top speed and Down decreases it to zero.
6. Carrier attack orders stop the carrier and launch all eligible deck aircraft toward the target.
7. Carrier-launched F22 move orders preserve their destination through launch and do not immediately recover.
8. Enemy Destroyers engage naval targets with guns and attacking aircraft with anti-air rockets.
9. Submarine automatic torpedo cooldown is 5.2 seconds, half the former rounds-per-minute rate.
10. Torpedoes render at 50% opacity to communicate underwater travel.
11. Ship destruction begins with an immediate explosion; large hulls receive multiple spatially distributed explosions before sinking.
12. Empty or loaded ferries accept shore commands, turn in navigable water, then reverse until their stern touches the coast.

## Delivery note

This iteration implements criteria 2, 5, 9, and 10 with unit regression coverage. The remaining criteria stay explicitly open in `TODO/Improvements.md` rather than receiving lower-confidence partial implementations.
