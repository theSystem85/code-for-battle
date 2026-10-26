# Deferred map decorations

## Improvement

- [x] **Keep map scrolling responsive while decoration pages catch up** — render terrain, roads, water, rocks, player buildings, and units immediately while decorative vegetation, ground detail, and city overhangs wait for main-thread idle capacity; optionally fade prepared decoration pages in after camera motion settles.
  - Spec: none

## Performance verification

The implementation removes decorative sprite selection and drawing from synchronous terrain chunk rebuilds. A separate bounded, one-page-per-idle-callback preparation queue stays paused while direct, keyboard, gamepad, smooth, or inertial camera movement continues. Hardware-backed 75 FPS acceptance remains pending on Patrick's qualifying GPU because this environment was not used for software-rendered performance measurements.
