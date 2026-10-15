- [ ] **Feature: Vehicle factory garage exits**
  Produced vehicles roll southwest out of a dark garage before becoming available. The vehicle factory map sprite now has a transparent gate (original kept in `public/images/map/buildings/originals/vehicle_factory_with_tank.webp`). Exiting units are drawn below the factory and redrawn above its dirt apron, clipped to everything outside the factory walls, so they are only hidden by the building body. Visual capture done in headless Chromium at DPR 1 and 3 (`tests/e2e/factoryExitCapture.test.js`, opt-in with `FACTORY_EXIT_CAPTURE=1`); real-device and qualifying-hardware performance checks outstanding.
  Spec: [Vehicle factory exit animation](../../specs/vehicle-factory-exit-animation.md)

Possible next step (not implemented): animated garage door opening and closing.
