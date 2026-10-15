- [ ] **Feature: Vehicle factory garage exits**
  Produced vehicles roll southwest out of a dark garage before becoming available. The vehicle factory map sprite now has a transparent gate (original kept in `public/images/map/buildings/originals/vehicle_factory_with_tank.webp`). Exiting units are drawn below the factory and redrawn above its dirt apron, clipped to everything outside the factory walls, so they are only hidden by the building body. Visual capture done in headless Chromium at DPR 1 and 3 (`tests/e2e/factoryExitCapture.test.js`, opt-in with `FACTORY_EXIT_CAPTURE=1`); real-device and qualifying-hardware performance checks outstanding.
  Spec: [Vehicle factory exit animation](../../specs/vehicle-factory-exit-animation.md)

Possible next step (not implemented): animated garage door opening and closing.

## Follow-up: slower roll-out and blocked exit/rally handling

- `FACTORY_EXIT_DURATION` is now 3800 ms (slow crawl, ~0.85 tiles/s); `FACTORY_EXIT_STAGGER` is 40% of it (1520 ms).
- Blocked exit tile: idle friendly units on it are nudged to the nearest free tile; if it is still blocked after `FACTORY_EXIT_BLOCKED_WAIT` (1000 ms), the vehicle uses the nearest free tile west/south of the factory (deterministic spiral search). No more waiting forever inside.
- Blocked or already-targeted rally tile: the unit drives to the nearest free reachable tile around it (deterministic spiral, fixed ring order), so queued units get distinct spots.
- The unit is invisible while waiting in the dark gate and fades in over the first 15% of the roll-out, hiding the barrel tip.
- Version bumped to 0.50.0 after rebasing onto 0.49.0.
