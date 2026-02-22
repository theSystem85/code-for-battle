# Spec 044: Mobile Initial Layout Stability

## Context
Mobile Safari/Chrome emulation can initialize with stale orientation-safe-area values and sidebar state before the first rotation event, causing hidden controls and unfilled safe-area regions.

## Requirements
- On initial mobile landscape load, the sidebar must start in a visible condensed/open state (not fully hidden/collapsed by default).
- Mobile safe-area CSS variables must be synchronized on initial load (and shortly after) so portrait bottom inset regions render correctly without requiring manual rotation.
- In mobile landscape, the notification bell button must render at the top-left safe-area position to avoid overlap with sidebar controls.

## Implementation Notes
- Keep existing rotation/resize listeners intact.
- Add an initial + deferred safe-area inset sync pass using runtime-computed `env(safe-area-inset-*)` values.
- Preserve persisted user sidebar preferences when explicitly set; only adjust the fallback default for first landscape load.


## Follow-up (PWA Verification)
- Landscape bell placement MUST apply for all `body.mobile-landscape` sizes, not only narrow (`max-width`) breakpoints, so tablet/wider PWA landscape still pins to top-left safe area.
- Portrait `pwa-standalone` canvas rendering MUST extend through safe-area insets on first load so no bottom gap appears before rotation.
- Safe-area sync SHOULD run multiple deferred passes after startup/layout updates because iOS may resolve inset values asynchronously after first paint.
