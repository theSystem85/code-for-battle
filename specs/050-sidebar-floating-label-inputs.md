# Spec 050: Sidebar Floating Label Inputs

## Summary
Introduce a reusable floating label input wrapper style for sidebar form controls so text/number fields present a professional RTS-themed UI while preserving accessibility and readability.

## Requirements
- Sidebar text and number inputs must use a floating label wrapper that keeps labels visible after value entry.
- Existing static labels tied to converted sidebar inputs must be removed to avoid duplicate labeling.
- Floating label typography must use the Rajdhani game font family already used in the sidebar.
- Input styling must align with the existing dark futuristic UI language (focus glow, compact spacing, clear contrast).
- Floating-label input height must stay aligned with prior sidebar input height (40px) to avoid layout growth.
- Floating-label field styling must use a flat solid background (no inner gradient) and no borders.
- Floating label color must match the tutorial green accent (`#6efc4b`).
- Number input spinners should be visually aligned with the floating-label theme on desktop pointer devices.
- Number input spinner arrows must match the input font color and use no separate spinner background.
- Number input spinner button area must use the exact same background color as its associated number input field.
- Sidebar and related settings dropdown/input controls must use `border-radius: 0` for square corners.
- Dropdown caret icons must have explicit right-side inset/padding so left/right horizontal spacing appears visually consistent.
- Spacing and padding should remain compact and non-wasteful in the sidebar.
- Map settings and multiplayer invite flows must remain fully functional after the markup migration.
- The `Your alias` floating input must be placed in the Multiplayer section above the invite-link row.
- In Map Settings, `Seed` and `Players` fields must share one horizontal row.
- In Map Settings, `Width` and `Height` fields must share one horizontal row.
- Add an E2E test that verifies floating label wrappers and migrated labels render in the sidebar.

## Implementation Notes
- Use a `.floating-label-input` wrapper around native `<input>` and `<textarea>` tags with sibling `<label>`.
- Use `:placeholder-shown` and `:focus` transitions for the floating behavior.
- Keep checkbox inputs unchanged.
