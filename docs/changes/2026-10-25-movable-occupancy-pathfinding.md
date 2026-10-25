# Bug

- [x] **Pathfinding ignores movable occupancy**
  Units and wrecks are tagged as movable occupancy and no longer force a detour; buildings and other fixed blockers still block the shortest path, and the occupancy overlay paints movable tiles orange.
  Spec: none

Hardware FPS acceptance is pending. This environment has no verified hardware GPU, so Patrick should confirm 75 FPS on `dev` with the occupancy overlay on and units pushing through a crowd.
