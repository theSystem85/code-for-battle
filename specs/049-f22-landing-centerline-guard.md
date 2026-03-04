# Spec 049: F22 landing centerline guard near airstrip non-passable region

## Context
F22 units can drift into non-passable tiles around the airstrip during `landing_roll`, then repeatedly collide and appear stuck.

## Requirements
- During `landing_roll`, F22 movement must apply a soft but continuous lateral correction toward the runway centerline.
- If the F22 center is already on a non-taxi surface tile while landing, the lateral correction must be stronger so recovery is reliable.
- The fix must not introduce abrupt teleporting; correction should remain velocity-based and smooth.
- Existing landing flow (`landing_roll` -> `taxi_to_parking` -> `parked`) must stay intact.

## Acceptance Criteria
1. In an E2E setup where an F22 is forced into `landing_roll` with a Y offset toward non-passable airstrip-adjacent tiles, the absolute Y distance to runway centerline decreases over time.
2. The F22 does not remain pinned in the off-center/non-passable region and proceeds with landing progression.
3. No regressions in the runway state machine transitions are introduced.

## Validation
- E2E: `tests/e2e/f22LandingCenterlineGuard.test.js`
