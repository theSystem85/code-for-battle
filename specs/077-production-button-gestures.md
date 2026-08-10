# Production Button Gesture Reliability

## Requirements

- Every unit production button, including ground, air, and water units, increases its stack when its upper half is clicked or tapped and decreases it when its lower half is clicked or tapped.
- Pointer releases activate immediately so rapid repeated mouse clicks and touch taps are not throttled by delayed compatibility-click delivery.
- The release coordinate determines the upper/lower action in every viewport orientation.
- A gesture that moves at least eight CSS pixels inside the action bar, changes its scroll position, or emits a scroll event is exclusively a scroll gesture and must not alter a production stack on release.
- A pointer leaving the action bar retains the existing drag-to-map behavior and must not also activate the button.

## Verification

- Unit tests cover consecutive immediate upper/lower taps and compatibility-click suppression.
- Unit tests cover movement plus an action-bar scroll before release and assert that no activation occurs.
