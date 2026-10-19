- [x] **Improvement: M2 combat balance**
  Reduce firing cadence to one shot per three seconds and use one 1% casualty roll per hit, selecting at most one living crew member.
  Spec: [Light Tank](../../specs/light-tank-bradley.md)

- [x] **Improvement: Shorter factory exits and clear doors**
  Hand vehicles to normal navigation on the first clear outside tile, preserve crawl speed, reserve queued exits and remove added door/shadow shading.
  Spec: [Vehicle factory exit animation](../../specs/vehicle-factory-exit-animation.md)

- [ ] **Validation: Reference hardware performance**
  The required 75 FPS live before/after acceptance on qualifying hardware remains outstanding; headless browser checks cannot certify presented FPS.
  Spec: [Vehicle factory exit animation](../../specs/vehicle-factory-exit-animation.md)

Validation: 5,312 unit tests verified (release-script file retried after sandbox Git execution was allowed), 86 integration tests and both DPR browser cases passed. Lint and whitespace checks passed.
