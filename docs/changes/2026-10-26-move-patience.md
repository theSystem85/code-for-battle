# Improvement

- [x] **Move patience breaks up stuck unit clusters**
  Units with a destination spend one second of a 10-second budget whenever they fail to move about a meter, then take the existing local dodge and refill; more than five of the player's own stuck units inside a 5-tile radius raise a goto notice.
  Spec: [Move patience](../specs/2026-10-26-move-patience.md)

Hardware FPS acceptance is pending. This environment has no verified hardware GPU, so Patrick should confirm 75 FPS on `dev` while a crowd of units is stuck on one route.
