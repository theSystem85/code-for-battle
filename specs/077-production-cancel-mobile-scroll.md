# Production lane cancellation and mobile scroll safety

## Requirements

- Ground, naval, and air unit stacks use identical decrement, pause, and cancellation behavior.
- A production action targets the independent factory lane that owns the selected unit type.
- In mobile landscape, releasing a build-bar scroll or drag must never activate the button below the release point, even when native scrolling consumes intermediate pointer-move events.
- A production button may activate only when pointer release occurs within 250 ms of pointer down and total movement is at most 6 px.
- A qualifying quick tap must retain upper-half stack increase and lower-half stack decrease behavior.

## Verification

- Unit tests cover independent naval/air lane cancellation, click suppression after movement or a long press, pointer-cancel suppression, and acceptance of quick stationary taps.
