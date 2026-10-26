# Opportunistic map decorations

## Improvement

- [x] **Keep published decorations stable during scrolling** — prepare visible decoration pages incrementally using only browser-reported idle capacity, retain completed pages throughout camera movement, and abandon unfinished work once its chunk leaves the viewport.
  - Spec: none

## Performance verification

Decoration preparation no longer waits for camera motion to settle and never runs from a timer without an idle deadline. Work is split at tile boundaries and yields while preserving headroom in the current idle period. Hardware-backed 75 FPS acceptance remains pending on Patrick's qualifying GPU; this environment was not used for a software-rendered performance benchmark.
