# Production Button Gesture Reliability

## Requirements

- Every unit production button, including ground, air, and water units, increases its stack when its upper half is clicked or tapped and decreases it when its lower half is clicked or tapped.
- Pointer releases activate immediately so rapid repeated mouse clicks and touch taps are not throttled by delayed compatibility-click delivery.
- The release coordinate determines the upper/lower action in every viewport orientation.
- A touch gesture that moves at least five CSS pixels inside the action bar, changes its scroll position, emits a scroll event, or is cancelled is exclusively a non-tap gesture and must not alter a production stack on release.
- Release displacement is checked independently because mobile browsers may coalesce or consume intermediate move events during native scrolling.
- A pointer leaving the action bar retains the existing drag-to-map behavior and must not also activate the button.
- Desktop building buttons use drag-to-map placement without their pointer gesture bookkeeping clearing the dragged building before the canvas drop.
- Ground, air, and water unit buttons share identical stack decrement and drag-to-rally behavior.
- Mobile movement or action-bar scrolling irrevocably classifies the gesture as scrolling through release and any later compatibility click; it must never queue or remove a production item.

## Verification

- Unit tests cover consecutive immediate upper/lower taps and compatibility-click suppression.
- Unit tests cover movement plus an action-bar scroll before release and assert that no activation occurs.
- Browser-level regression coverage must first demonstrate the current desktop drag, air/water decrement, and mobile scroll-release failures, then prove the corrected behavior with real pointer event sequences.
- `tests/unit/productionControllerInteractions.test.js` covers mouse/native separation, ordinary rapid touch taps, action-bar movement/scrolling, and release-only displacement when move events were coalesced.
- `tests/unit/productionQueue.test.js` covers stack count and cancellation in the independent ground, air, and naval production lanes.
- `npx playwright test tests/e2e/productionButtonGestureParity.test.js tests/e2e/mobileProductionScrollSafety.test.js --project=chromium --reporter=line --workers=1` verifies native desktop building drag, lower-half decrement and drag-rally queuing for ground/air/water, plus real touch scrolling that queues nothing for building/ground/air/water categories.
