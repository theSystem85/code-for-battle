# Feature Specification: Mobile Landscape Safe-Area Fill

## Overview
Landscaped touch layouts on iPhone 13 Pro Max still leave a black bar on the right edge where the build menu and energy indicator sit. The playable canvas should occupy that space, the build controls need to shift fully into the safe-area inset, and the power bar has to align with the rest of the UI.

## Requirements
1. **Canvas Coverage**
   - `CanvasManager.resizeCanvases()` must size both canvases to include the device's right safe-area inset in landscape. No black column should remain once the sidebar is collapsed.
   - Map content must scroll beneath the notch-safe area without stretching or distorting aspect ratios.

2. **Build Menu Positioning**
   - `#mobileBuildMenuContainer` should anchor to the physical right edge of the screen with internal padding equal to `var(--safe-area-right)` so touch targets avoid the notch.
   - Build buttons and tabs should maintain their widths but sit flush with the visible edge.

3. **Status Bar Alignment**
   - The green power bar and money display in the mobile status bar must align with the build menu content and stay vertically stacked without overlap.
   - The energy bar text must remain fully readable while centered inside the bar.

4. **Device Scope**
   - Changes must specifically target landscape touch layouts and respect existing portrait sidebar logic.
   - Safe-area CSS variables continue to derive from `body.is-touch` so the solution works for other notch devices.

## Update 2026-02-06

- **Mobile Action Bar Feedback**: Repair and sell buttons in the mobile landscape action bar must switch to green icon accents when active (no extra borders), while the play/pause icon remains a clean white glyph.

## Update 2026-02-17

- **Notification Bell Placement**: In mobile landscape mode, the notification history bell icon must render at the top-left and respect `var(--safe-area-left)` so it stays clear of notches and system insets.

## Update 2026-02-18

- **Production Toggle Legibility**: In mobile landscape mode, the production category toggle label must render in uppercase with a reduced font size so `BUILDINGS` always fits the available width.
- **Short Building Labels (Landscape Only)**: In mobile landscape mode, long building names shown on production buttons must switch to compact labels (e.g., `Vehicle Fab`, `Radar`, `Workshop`, `Ammo Fab`, `Turret V1/V2/V3`) while preserving full names in all non-landscape layouts.
- **Toggle Text Alignment Follow-up**: In mobile landscape mode, adjust only the production toggle label alignment (left-aligned text inside the same full-width button) and allow an additional 1px font-size reduction when needed for fit.

## Update 2026-04-09

- **Extended Sidebar Availability in Landscape**: Mobile landscape must keep the extended sidebar sections (save/load and stats) directly in the sidebar scroll area, matching portrait behavior instead of routing those sections through a separate modal.
- **Modal Cleanup**: Remove unused mobile landscape sidebar modal markup, styling, and JavaScript state/handlers once extended sidebar content is always available inline.
- **Extended Menu Toggle Visibility**: Keep a visible mobile-landscape action-bar toggle for extended menu navigation; it should remain available after modal removal and allow quickly switching between build controls and extended sidebar sections.
- **Extended Menu Toggle Reliability**: Tapping the landscape extended-menu toggle must always reveal extended sections, including when the sidebar starts collapsed; implementation should auto-expand and scroll within `#sidebarScroll` to avoid no-op clicks.
