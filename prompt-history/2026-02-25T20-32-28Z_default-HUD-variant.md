# Prompt: Ensure Default HUD 4 Variant and Map Seed 4 are Selected
**UTC Timestamp:** 2026-02-25T20:32:28Z  
**LLM Model:** GitHub Copilot (Claude Haiku 4.5)

## Prompt (Initial)
ensure by default HUD 4 variant is selected for units (the donut version)

## Prompt (Follow-up)
it does not work yet when I test it in incognito browser. Ensure HUD 4 "Modern (donut arcs + edge crew)" with value "modern-donut" is loaded by default. For some reason it does not work yet. Fix it! Also ensure that map seed 4 is default!

## Changes Made

### Initial Fixes
1. **src/rendering/unitRenderer.js** - Updated `getSelectionHudMode()` fallback from 'modern' to 'modern-donut'
2. **src/input/cursorManager.js** - Updated `getSelectionHudMode()` fallback from 'modern' to 'modern-donut'
3. **TODO/Bugs.md** - Added completed bugfix entry

### Follow-up Fixes (For Incognito Mode)
1. **index.html line 823** - Added `selected` attribute to the 'modern-donut' option in the selectionHudModeSelect
2. **index.html line 621** - Changed mapSeed default value from 1 to 4
3. **src/game/gameOrchestrator.js line 616** - Changed renderSelectionHudPreview fallback from 'modern' to 'modern-donut'
4. **src/game/gameOrchestrator.js line 719** - Changed select initialization fallback from 'modern' to 'modern-donut'
5. **src/game/gameOrchestrator.js line 328** - Changed seed fallback from '1' to '4'
6. **src/game/gameOrchestrator.js line 1041** - Changed seed fallback from '1' to '4'

### Summary
The initial fix was incomplete for incognito mode because:
- HTML select elements need the `selected` attribute to pre-select an option (important when localStorage is cleared)
- Multiple JavaScript fallbacks throughout gameOrchestrator.js still defaulted to 'modern' and '1'
- These fallbacks are hit during initialization before localStorage values are restored

Now the donut HUD variant will be selected by default in all scenarios, including incognito mode.

### Spec Reference
- Spec 034: Selected Unit HUD Refactor - Requirement 18: "Default selected-unit HUD mode must be **HUD 4 (modern donut)** on fresh loads before any local storage override."

### Testing Notes
- Linting: passed `npm run lint:fix:changed` with no errors
- The change ensures that on fresh loads (including incognito mode), the donut HUD variant is displayed
- Map seed now defaults to 4 instead of 1
- All fallback chains properly default to donut variant and seed 4

