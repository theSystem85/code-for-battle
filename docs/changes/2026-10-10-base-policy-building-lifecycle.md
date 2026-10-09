- [x] **Bug: Shared player building lifecycle**
  Manual and policy blueprint placement now share construction finalization, including power, occupancy, technology, network sync and build history; sales and multiplayer snapshots use simulation time so removal clears power and chimney emitters. Policy placement keeps searching when the player validator rejects an AI candidate.
  Spec: none
- [ ] **Validation: 75 FPS hardware gate**
  Qualifying reference-hardware before/after scrolling and active-sale benchmarks remain outstanding; headless functional coverage cannot certify 75 presented FPS.
  Spec: none

Validation: `npm run lint:fix:changed`, `npm run lint`, `npm run test:unit`, and `npx playwright test tests/e2e/basePolicyBuildingLifecycle.test.js --project=chromium --reporter=line`.
The Chromium regression verifies real costs, power deltas, 70% refunds, selection cleanup, map cleanup and removal of power-plant/refinery chimney emitters. Free construction and missing power on creation did not reproduce; their shared queue/lifecycle behavior is now covered.
