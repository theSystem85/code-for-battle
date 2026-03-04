# Spec 050: Sidebar Floating Label Inputs

## Summary
Introduce a reusable floating label input wrapper style for sidebar form controls so text/number fields present a professional RTS-themed UI while preserving accessibility and readability.

## Requirements
- Sidebar text and number inputs must use a floating label wrapper that keeps labels visible after value entry.
- Existing static labels tied to converted sidebar inputs must be removed to avoid duplicate labeling.
- Floating label typography must use the Rajdhani game font family already used in the sidebar.
- Input styling must align with the existing dark futuristic UI language (subtle borders, focus glow, clear contrast).
- Map settings and multiplayer invite flows must remain fully functional after the markup migration.
- Add an E2E test that verifies floating label wrappers and migrated labels render in the sidebar.

## Implementation Notes
- Use a `.floating-label-input` wrapper around native `<input>` and `<textarea>` tags with sibling `<label>`.
- Use `:placeholder-shown` and `:focus` transitions for the floating behavior.
- Keep checkbox inputs unchanged.
