# Feature Specification: Mobile Portrait Sidebar Toggle

**Feature Branch**: `010-mobile-portrait-sidebar-toggle`
**Created**: 2025-11-16
**Status**: Complete
**Input**: "Make the sidebar on the left toggleable in portrait mode on mobile"

---

## Overview

Touch users holding the device in portrait orientation need the ability to reclaim the entire screen for gameplay without losing access to sidebar controls. The existing mobile-landscape toggle and modal experience now extends to portrait: the floating toggle button becomes available on touch devices even when the layout keeps the sidebar in its desktop position. Collapsing hides the sidebar off screen and allows the canvas to span the full width while keeping accessibility labels accurate.

---

## Requirements

1. **Toggle Availability**
   - Reuse the existing `#sidebarToggle` button inside `#mobileSidebarControls` and surface it whenever `body` has the `mobile-portrait` class.
   - Ensure `aria-hidden` on `#mobileSidebarControls` reflects whether portrait/landscape mobile UI is active so the toggle can be focused with screen readers.

2. **Collapse Behaviour**
   - When collapsed in portrait, slide the sidebar fully off-screen to the left and expand `#gameCanvas` to cover the full viewport width. Animate both with the same easing used for mobile landscape.
   - Maintain safe-area awareness so the floating toggle sits below any notches using the CSS custom properties that already track env(safe-area-inset-*).

3. **State Persistence**
   - Keep storing the collapsed state in `mobileLayoutState.isSidebarCollapsed` so user preference carries across orientation changes.
   - Default to collapsed in landscape and expanded in portrait until the user explicitly toggles.

4. **No DOM Reparenting in Portrait**
   - Portrait mode should leave the production/action panels in their desktop containers. Only the toggle visibility and collapse CSS change; the modal-driven mobile menu remains exclusive to landscape.

5. **Accessibility**
   - Update the toggle's `aria-label`/`aria-expanded` attributes to describe the sidebar state no matter the orientation.
   - Preserve Escape-key dismissal for the landscape modal while ensuring portrait mode never attempts to open it.

---

## Update 2025-11-17

- **Canvas Fill Requirements**: When collapsing or expanding the sidebar in portrait orientation the game canvas must resize immediately (no blank strip) so the map is always visible along the left edge. Resizing the internal canvas dimensions should happen alongside the CSS transition to prevent jump cuts or large black bars.
- **Gesture Closing**: While the sidebar is open in portrait, a leftward swipe starting on the sidebar itself or within roughly the first sidebar-width worth of screen space must close it so players can dismiss the menu without tapping the toggle.
- **Minimal Toggle Presentation**: When the portrait sidebar is collapsed, the floating toggle button in the top-left corner should remain but lose its opaque background so the gameplay view is not obscured. Use a transparent background with just the outline/icon visible until the sidebar reopens.

## Update 2025-11-18

- **Invisible Toggle When Expanded**: In portrait mode the floating toggle must be hidden entirely whenever the sidebar is expanded. The open state is dismissed exclusively through leftward swipe gestures, so the toggle should not be focusable, clickable, or visually present until the sidebar collapses again.
- **Map Coverage Guarantee**: Collapsing the portrait sidebar must immediately reclaim the entire viewport for the canvas at both the CSS and actual canvas resolution levels. This includes updating inline dimensions from the canvas manager so no residual left offset or reduced width leaves a black bar.

## Update 2026-01-20

- **Portrait Visual Polish**: In portrait mode, the sidebar should use a narrower clamp-based width, refined padding, and a subtle gradient/border treatment to feel more premium on small screens.
- **Action Button Layout**: The portrait sidebar action buttons should stack into a tidy grid with consistent sizing and spacing for touch ergonomics.
- **Minimap Fit**: Keep the minimap compact with a softer radius and tighter spacing so it reads cleanly within the portrait column.

## Update 2026-01-20 (Condensed Mode)

- **Condensed Portrait State**: Swiping left on the expanded portrait sidebar should collapse it into a condensed HUD state (not fully hidden).
- **Bottom Build Bar**: The condensed state must show a horizontal, scrollable build bar along the bottom with the units/buildings toggle button aligned on the right.
- **Side HUD Elements**: The condensed state must place the minimap on the lower-left above the build bar and the action buttons stacked on the lower-right above the build bar.
- **Swipe-to-Hide**: A downward swipe on the condensed build bar should fully hide the sidebar, leaving only the restore menu button.
- **Icon-Only Actions**: Action buttons in condensed mode should stack from bottom to top and use icon-only styling with no background or border.
- **Landscape-Matched Minimap**: The condensed minimap should match the landscape appearance and behavior.
- **Vertical Toggle Label**: The build category toggle should use vertical text to minimize horizontal space usage.

## Update 2026-01-21

- **Condensed Build Bar Visibility**: The portrait condensed build bar must render only unlocked production buttons; the row should lay out left-to-right and scroll horizontally with no visible scrollbar.
- **Right-Aligned Toggle**: The build category toggle stays docked on the right edge of the build bar while buttons occupy the remaining horizontal space.
- **PWA Bottom Edge**: In standalone/PWA mode, the condensed build bar background should extend to the bottom edge of the screen without leaving a visual gap.

## Update 2026-01-22

- **Portrait Sidebar Persistence**: Persist the portrait sidebar state (expanded, collapsed, condensed) in localStorage and restore it on load/rotation.
- **Default Condensed**: If no preference is stored, default the portrait sidebar to the condensed state.

## Bug Fix 2026-02-02

- **Swipe Functionality Fix**: Fixed issue where `syncPortraitSidebarState()` was being called on every `applyMobileSidebarLayout('portrait')` invocation, overwriting user swipe actions. Now only syncs stored state once on initial portrait mode entry using `hasPortraitStateBeenSynced` flag.

## Update 2026-02-04

- **Condensed Status Bar Placement**: In portrait condensed mode, the mobile money/energy status bar should render in the safe-area gap below the build buttons, using the existing protective area space without shifting the condensed build bar upward.
- **Non-PWA Right Dock**: When not running in standalone/PWA mode, the portrait condensed money/energy bars must dock to the right of the build bar after the units/buildings toggle, fill vertically from bottom to top within the existing bar height, and display centered 90°-rotated labels without increasing the sidebar height.

## Update 2026-02-06

- **Action Bar Active States**: Repair and sell buttons surfaced in the portrait HUD must switch to green icon accents when active (no borders or extra chrome).
- **White Play/Pause Icon**: The play/pause glyph in the portrait action strip should always render as a clean white icon, without additional color fills.
- **Control Group Visibility**: Hide the unit group action button while the portrait action bar remains inside the expanded sidebar; only show it in the condensed HUD state.

## Update 2026-02-12

- **Hidden Inactive Build Buttons**: In mobile condensed build menus, default production buttons that are still inactive/locked must remain hidden and only render once they become unlocked or otherwise active (queued/paused/ready).
## Update 2026-02-12 (Notification Safe Area)

- **Top Notch Protection for Notifications**: On mobile portrait layouts, transient top notifications must be offset by `var(--safe-area-top)` so banners always render below the notch/protective inset and remain fully readable.

## Update 2026-02-12 (Modal + Sidebar Notch Safety)

- **Modal Notch Clearance**: In mobile portrait mode, modal overlays/dialogs must preserve top safe-area clearance so modal content does not render underneath the notch.
- **Expanded Sidebar Top Clearance**: Expanded portrait sidebar content must start below the top safe-area inset to keep controls readable and touch-safe around the notch region.
- **Notification History Controls**: The notification history bell toggle and opened history panel must anchor below `var(--safe-area-top)` in portrait layouts.


## Update 2026-02-12 (Drag vs Tooltip Guard)

- **Drag-to-Build Priority**: In mobile portrait build interactions, drag gestures from production buttons must cancel long-press tooltip activation once movement crosses the drag threshold.
- **No Tooltip During Active Drag**: While a touch drag-to-build gesture is active for a production button, the production tooltip must remain suppressed to avoid stealing focus from placement flow.

## Bug Fix 2026-03-28

- **Condensed Tab Toggle Reliability**: In portrait condensed mode, the `#mobileCategoryToggle` must resolve the active build tab strictly from production tab buttons (`#productionTabs .tab-button[data-tab]`) and ignore unrelated sidebar tab buttons (for example Save/Replays tabs).
- **First-Load Behavior Guarantee**: On initial portrait condensed load (before any expand/collapse interaction), tapping the category toggle must immediately switch between Buildings and Units when both categories are available.
