# Spec: Sidebar Visual Gradient Polish

## Summary
Improve the sidebar background treatment so it is clearly visible, professional, and less flat by using a stronger left-to-right gradient plus a tiny rounded top-right edge highlight.

## Requirements
- Preserve current sidebar dimensions, spacing, and text color behavior.
- Keep the dark theme and avoid noisy or overly bright effects.
- Render the main gradient from left to right.
- Add a small (about 5-10px) top-right edge gradient/drop effect so the edge feels slightly rounded.

## Acceptance Criteria
- Sidebar background visibly transitions from lighter left to darker right while remaining professional.
- A subtle top-right edge highlight/drop is present and constrained to a very small footprint.
- Sidebar text and controls remain legible with no functional regressions.

## Follow-up (2026-02-21)
- Apply a slight horizontal gradient treatment to the sidebar power and money fill bars for desktop and mobile portrait so they feel less flat while preserving readability.
- Ensure the expanded mobile portrait sidebar radar/minimap has square corners (no rounding).
- Adjust sidebar resource-bar gradients so they finish in a brighter end-color (left-to-right brightening) rather than darkening.
- Reuse the same desktop sidebar background gradient on mobile portrait expanded sidebar and the condensed sidebar surfaces.
