# 034 - Selected Unit HUD Refactor

## Summary
Refactor the selected-unit HUD to improve readability and reduce occlusion of the selected unit sprite.

## Requirements
1. Selection outline must be a **1px yellow** rectangle.
2. HUD stat indicators for **ammo, hp, fuel, load, xp** must:
   - be **3px thick**,
   - have **no border**,
   - use a **dark grey background**,
   - align so the selection outline runs through the **centerline** of each 3px indicator.
3. Crew indicator must be rendered **below** the bottom indicator bar.
4. XP bar becomes the **bottom** indicator bar.
5. XP stars must be rendered **directly over the HP bar**, overlapping by approximately **33%**.
6. Selected-unit HUD footprint should be **larger than a tile** so HUD indicators do not occlude the selected unit body.

## Affected area
- `src/rendering/unitRenderer.js`

## Acceptance checks
- Select a unit with all relevant indicators available and verify all five indicators appear at 3px thickness.
- Confirm the outline is exactly 1px and centered through each indicator strip.
- Confirm crew pips render below the bottom indicator strip.
- Confirm XP stars overlap HP strip by about one-third.
- Confirm the larger HUD perimeter leaves visible space around the unit sprite.
## Follow-up adjustments
7. Each edge bar span (horizontal/vertical) must be capped at **75% of one tile** so the selection outline remains visible around bar endpoints.
8. Crew indicators must be **centered horizontally** beneath the bottom status bar.
9. In HUD mode 4 (**modern donut**), the yellow selection rectangle must be hidden.
10. In HUD mode 4 (**modern donut**), donut arc thickness must be reduced by **2px** from the previous rendering width.
11. XP stars must be shifted upward enough to avoid overlapping the top HUD indicator in donut mode.

## Settings integration
9. Add a Settings modal dropdown allowing users to switch selected-unit HUD rendering mode with options:
   - classic pre-refactor HUD
   - current modern HUD
   - modern HUD without yellow border and with crew symbols distributed at the 4 HUD corners
10. Persist the selected HUD style in local storage and apply it on load.
11. Add a fourth HUD mode featuring four quarter-donut status arcs (3px thickness) around the selected unit, with crew symbols centered on top/right/bottom/left edges and at least 3px gap before adjacent arcs begin.
12. Refine mode 3 so crew symbols are centered on each rectangle corner centerpoint and refine mode 2 bar alignment so bars are centered on the yellow outline.
13. Render a live selected-tank HUD preview directly in the Settings modal to the right of the HUD style selector.
14. Add a HUD bar thickness number input in Settings with default **4px**, and persist/restore this value through local storage on startup.
15. Update the default HUD bar thickness to **4px** while keeping user-configurable persistence.
16. The settings HUD preview must use a real **rocket tank** unit image and match in-map HUD rendering behavior for HUD modes 1 and 2.
17. In HUD mode 4, shift XP stars further upward and slightly right so they center better with the top crew indicator.
## Hover micro-tooltips
18. While hovering over a selected unit HUD, show a tiny tooltip near the cursor for the exact hovered segment.
19. Tooltip labels must map precisely to HUD parts: `health`, `fuel`, `ammo`, `experience`, `rank stars`, and crew role markers (`commander`, `loader`, `gunner`, `driver`).
20. Tooltip should only appear when the cursor is over a HUD segment and should remain compact/minimal to avoid obscuring gameplay.

21. When hovering the currently selected unit or any of that selected unit's HUD elements, cursor style must stay on the game's default arrow cursor (no move/blocked/attack cursor override).
22. Bar tooltips must work in all existing HUD modes (legacy, modern bordered, modern borderless, modern donut), not only for crew markers.
23. Tooltip hit-testing must derive from HUD geometry (bar thickness/span/gaps) so style tweaks do not break hover detection.
24. Implementation should be extensible for additional HUD modes by centralizing mode-aware hit zone helpers.

18. Default selected-unit HUD mode must be **HUD 4 (modern donut)** on fresh loads before any local storage override.
25. In HUD mode 4 only, selected units draw an inward party-colored glow inside the circular HUD. The glow is an annulus from 36% of the donut radius to the donut ring. Opacity is zero at the inner edge, rises toward the ring, and softens again at the outer clip so the rim does not form a hard disc. The color is `PARTY_COLORS[unit.owner]`. The fill runs once per selected unit per frame, after the sprite and before the status arcs, and is clipped to the HUD disc (not the map or weapon range). Color-stop strings are cached per party color. Rectangular HUD modes do not draw this glow.
