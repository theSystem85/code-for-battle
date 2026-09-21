# 2026-09-21T22:44:31Z

**Model:** Cursor Cloud Agent using Grok 4.7
**Harness:** Cursor Cloud Agent

Token counts and exact task duration were not available to record.

## Prompt

You are working in theSystem85/code-for-battle (2D tile RTS, vanilla JS, Canvas/WebGL, Vite).

## Goal
Add a polished **loading screen** for (1) initial game boot/load and (2) map/game reload flows. It must look good and match the existing UI design language (sidebar, HUD, dark military/tech aesthetic of Code for Battle — study existing CSS/UI components and reuse fonts, colors, borders, and motion patterns).

## Requirements
- Show during first load (assets, config, map generation, etc.) and whenever the player reloads a map/game / starts a new mission that currently leaves a blank or janky gap.
- Cover the loading phases that already exist; if there is no single loading gate, introduce a clear loading state the UI can bind to without breaking gameplay.
- Visual design: on-brand (not a generic spinner on white). Prefer existing design tokens / CSS variables / HUD chrome. Progress indication when progress is knowable; otherwise an intentional indeterminate state that still feels finished.
- Accessible enough (readable text, not seizure-inducing flashes).
- Do not regress gameplay once loading completes; tear down cleanly.

## Constraints
- Investigate existing boot, asset load, map load, mission start, and UI shells first; reuse them.
- Keep scope to loading UX — no unrelated refactors.
- Hypothesis only (verify): there may already be partial loading UI or progress hooks — extend rather than replace if suitable.

## Done when
- Initial load and map/game reload both show the new screen.
- Look-and-feel matches the game UI.
- Loading completes into a playable state without leftover overlays.
- Open a PR with screenshots or a clear description of how to verify manually, plus any unit/smoke coverage that fits.

Investigate and implement; do not prescribe a single root file without looking.
