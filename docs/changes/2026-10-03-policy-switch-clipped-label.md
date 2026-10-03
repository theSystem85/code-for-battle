# Policy panel switch label clipped on narrow screens

- [x] **Policy switch label no longer clipped**: The global policy switch used the same `::after` pseudo-element for its knob and for its hover tooltip, so the tooltip text was squeezed into the 16px knob and clipped by the scrolling list (and was never visible on touch). The switch is now a labelled button (track plus visible "Off · click to enable" / "On · click to disable" text) that wraps below the title when space is short. Spec: [Unit policies — first slice](../../specs/unit-policies-first-slice.md)
