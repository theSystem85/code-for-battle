# Production lane cancellation and mobile scroll safety

## Requirements

- Ground, naval, and air unit stacks use identical decrement, pause, and cancellation behavior.
- A production action targets the independent factory lane that owns the selected unit type.
- In mobile landscape, a touch gesture that crosses the scroll threshold must not activate a production button when released.
- A stationary tap must continue to activate its production button normally.

## Verification

- Unit tests cover independent naval/air lane cancellation and click suppression after a touch scroll.
