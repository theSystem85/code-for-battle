- [x] **Bug: Mine layer crew and ammunition service**
  Mine layers spawn with a loader, refill their mine magazine near friendly ammunition factories and trucks, and show the move-into cursor and accept service clicks in both selection directions. Factory service routes to a reachable tile outside the building; truck service uses the existing utility queue. Partly replenished mines cannot be deployed until a full mine is available.
  Spec: none

Performance review: ammunition processing runs once per simulation tick per source/target pair; the new scalar field lookups allocate no objects and preserve entity state identity. At 75 ticks/s, 200 targets and 10 sources this adds constant field lookup work within the existing 150,000 source/target checks per second. Cursor checks run on pointer updates and only scan factory/mine targets for relevant selections. These operations do not depend on DPR and add no canvas rendering. Factory path searches run only on clicks. Hardware GPU / 75 FPS acceptance remains pending on Patrick's hardware; no software GPU benchmarks were run.

Validation:
- `npm run lint:fix:changed` and `npm run lint`.
- `npm run test:unit -- --maxWorkers=2` and `npm run test -- --maxWorkers=2`.
- Functional Chromium coverage: all four mine-layer/factory/truck selection-direction scenarios, plus the service approach stopping regression. The environment uses `/usr/bin/chromium` through a temporary Playwright config because the packaged browser is absent and its download domain returns HTTP 403.
- The complete E2E suite was not run: it includes hardware performance scenarios, and this environment has no verified hardware GPU. GPU acceptance remains pending as described above.
