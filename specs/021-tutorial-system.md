# Tutorial System

## Overview
Introduce an interactive onboarding tutorial that teaches new players the UI/UX flow. The tutorial must use the existing HUD and controls, display a tutorial cursor alongside the real pointer, and require the player to repeat each demonstrated action before advancing. The tutorial should adapt instructions for desktop and mobile control schemes.

## Core Requirements
- **Skippable**: Every step and the full tutorial can be skipped.
- **English-only**: All text and voice output must be in English.
- **Demo + Practice**: Each step demonstrates the action via automation, then waits for player replication.
- **Device-aware**: Instruction text adapts to desktop (mouse + keyboard) vs. mobile (touch + joystick).
- **Speech narration**: All step instructions, including the hint/subtext guidance, are read aloud using the browser Speech Synthesis API. Speech is enabled by default and can be disabled in settings.
- **Automation-safe speech**: Automated headless test runs must suppress tutorial speech regardless of persisted user settings so E2E execution stays silent.
- **Persistence**: Store tutorial progress and settings (show tutorial + voice) in localStorage.
- **Settings integration**: Add "Show tutorial on startup" and "Enable tutorial voice" toggles plus "Start Tutorial" and "Restart Tutorial" buttons.
- **Extensibility**: Steps are data-driven and easy to expand.

## Required Step Coverage
1. **Resources**: Show where money and energy are displayed in the UI.
2. **Economy setup**: Demonstrate building a Power Plant, Ore Refinery, and Vehicle Factory, then queue ore transporters (Harvesters).
3. **Harvester behavior**: Explain that harvesters automatically move to the nearest ore field, but can be directed manually.
4. **Selection**: Show selecting single units, multiple units, and deselection.
5. **Movement**: Show moving selected units.
6. **Tank production**: Show building a tank and setting a Vehicle Factory rally point (waypoint).
7. **Tank control**: Show sending the finished tank to a location and switching to manual/remote control.
8. **Combat**: Show attacking targets and explain the win condition (destroy all enemy buildings).
9. **Crew system**: Explain crew roles, the D/C/G/L HUD indicators, how tanks lose functionality when crew are missing, and how Hospitals + Ambulances restore crew. Demo should zero out a tank crew, focus the camera and cursor on the empty tank to show missing indicators, advance the final substep once any crew member is restored (progress bar only shown on this step), and announce completion with a voice line.
10. **Tech tree**: Explain building unlock chains through the full tech tree, with details on:
   - Tanker Truck + Gas Station (refueling)
   - Ambulance + Hospital + crew system
   - Ammunition Factory + Ammunition Truck + ammunition display
   - Workshop + Recovery Tank (armored recovery vehicle)

## UX Guidelines
- Tutorial overlay is non-invasive and uses the same HUD elements the player will use in gameplay.
- The tutorial cursor must be clearly visible and animated during demo actions.
- Step instructions remain on screen during practice phase.
- Use an inline progress bar for multi-part tutorial steps (e.g., crew/ambulance) to show partial completion.
- Provide a minimize/expand control so the tutorial can be collapsed without skipping, showing a small dock button for reopening.
- Include an in-tutorial voice toggle so narration can be switched on/off without opening settings.
- Allow stepping backward and forward, with Continue locked until the current step is completed.
- Reward completion by animating the Continue button when a step goal is met.
- Allow attack completion via manual/remote control firing as well as standard target orders.
- Do not auto-start the tutorial when the show tutorial setting is disabled.
- Hide the tutorial dock ("?") button after completion (via a visibility-hidden class) and keep it hidden on reload until the tutorial is restarted from settings.
- Hide the tutorial cursor indicator whenever the tutorial is minimized, skipped, disabled, or completed so it is never visible without an active expanded tutorial overlay.
- Use clear, concise copy with short actionable prompts.
- Ensure portrait mobile layouts keep the tutorial card within the visible canvas area, with tighter spacing and adjusted typography so actions remain accessible.
- Allow the tutorial card to overlap the sidebar instead of being offset to the right.
- In mobile portrait mode, default the tutorial card to the top-left corner (including over the sidebar) and let it span the full screen width when the sidebar is expanded.

## Data & Storage
- `rts_tutorial_settings` (localStorage):
  - `showTutorial` (boolean, default true)
  - `speechEnabled` (boolean, default true)
- `rts_tutorial_progress` (localStorage):
  - `completed` (boolean)
  - `stepIndex` (number)

## Implementation Notes
- Provide a `TutorialSystem` module in `src/ui` with a steps array and demo + completion callbacks.
- Keep tutorial code split into helper, UI, and step modules so each file stays under 1k LOC.
- Initialize the tutorial in the main UI setup flow after settings are available.
- Ensure demo actions call the same production, selection, and command systems used by players.
- Resume Web Audio only after a user gesture to avoid browser AudioContext warnings.
