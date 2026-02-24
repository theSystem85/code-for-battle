2026-02-24T17:39:42Z
LLM: copilot

## Prompt
"continue with last prompt"

(Previous conversation context: Implement the F22 Raptor stealth fighter unit. Issues reported with spawning points and movement mechanics. No previous implementation committed to this branch.)

## Summary of implementation
- Added F22 Raptor unit (f22Raptor) to config.js with full properties
- Created src/rendering/f22ImageRenderer.js for image-based rendering
- Updated units.js: F22 initialization (flight state, stealth, ammo, fuel) and airstrip spawn handling
- Updated productionQueue.js: F22 spawns from Airstrip (round-robin across airstrips)
- Updated productionControllerTechTree.js: F22 unlocked when Airstrip is built
- Updated productionControllerButtonSetup.js: F22 requires Airstrip
- Updated unitRenderer.js: F22 image rendering with altitude lift
- Updated helipadLogic.js: F22 landing/refueling/rearming at airstrip
- Updated helipadUtils.js: handles both apache and f22Raptor in availability check
- Updated movementCore.js and movementHelpers.js: F22 uses Apache flight system
- Updated unitCombat.js: F22 uses apacheCombat system
- Updated apacheCombat.js: F22 uses airstrip instead of helipad
- Updated airCommands.js: F22 can receive flight commands
- Updated mouseCommands.js and mouseSelection.js: click airstrip to land F22
- Updated cursorManager.js: F22 gets helipad landing cursor on airstrip hover
- Updated enemyAIPlayer.js: AI produces F22 from airstrips
- Updated enemyUnitBehavior.js: F22 uses Apache AI, F22 targets updated for air units
- Updated llmStrategicController.js: F22 in unit catalog
- Updated ammunitionSystem.js, ammunitionTruckLogic.js: F22 uses rocketAmmo
- Updated bulletCollision.js, bulletSystem.js: F22 altitude adjustment
- Updated unitMovement.js: F22 excluded from ground attack-move
- Updated logistics.js: F22 uses rocketAmmo for ammo tracking
- Added F22 sidebar button to index.html
- Added F22 tooltip in productionTooltip.js
- Created spec 046-f22-raptor-unit.md
- Updated TODO/Features.md
