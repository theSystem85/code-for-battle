# Production lane cancellation and mobile scroll safety

## Requirements

- Ground, naval, and air unit stacks use identical decrement, pause, and cancellation behavior.
- A production action targets the independent factory lane that owns the selected unit type.
- In mobile landscape, a touch gesture that crosses the scroll threshold must not activate a production button when released.
- A stationary tap must continue to activate its production button normally.
- Native browser scrolling and its `pointercancel` sequence must suppress release clicks on unit buttons, even when the browser begins scrolling before JavaScript observes the movement threshold.
- A touch may activate production only if total pointer movement stays below 5px. Movement of 5px or more suppresses building until release and consumes the release click.

## Verification

- Unit tests cover independent naval/air lane cancellation and both pointer-move and native-scroll cancellation click suppression.
- A mobile Chromium E2E test performs a real touch scroll over a unit build button, verifies that production does not start on release, and then verifies that a stationary tap still starts production.
- Threshold coverage verifies that a sub-5px tap remains valid while movement at 5px is not treated as a build tap.
