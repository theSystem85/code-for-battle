# Production stack controls

- First lower-half activation pauses every queued item for that button, preserving its count and any paid progress.
- Repeated lower-half activations on that paused stack remove one queued item at a time and refund any paid progress when its interrupted item is removed.
- A lane immediately continues its next unpaused stack. Multiple stacks may stay paused; a lane with only paused stacks stays idle.
- Upper-half activation resumes a paused stack without adding an item, taking priority in its production lane. Subsequent upper-half activations add items as usual.
- Unit factory lanes remain independent. Paused stacks and interrupted progress survive save/load and replay commands.
- Paused buttons display a pause icon. Desktop hover over the bottom name label opens the information sheet; hovering elsewhere does not. The label and sheet have square corners. Keyboard focus retains access to the sheet.
- Desktop hover shows a wide white arrow at 25% opacity: up over the upper half, down over the lower half including the label.

Performance: no work added to simulation ticks or entity rendering. Hardware 75 FPS acceptance is pending on dev; no hardware GPU was verified in the cloud environment.
