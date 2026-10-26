# 2026-10-26 21:30:00 UTC

Model: Codex using GPT-5.6 Sol

## Prompt

Repo work on branch `dev` only. Commit on the result branch (we apply onto `dev` after a clean rebase). Do not open a pull request. English only. Conventional commits (commit messages per AGENTS.md). Follow AGENTS.md (rules 1-4, 12-20): unit tests, lint, docs/changes entry, features/unreleased JSON if applicable, and a unique prompt-history file naming the exact model used (Codex).

TEST POLICY: Run `npm run lint`. Run unit/integration tests for files you touch and `npm run test:unit` if AGENTS.md requires it; fix real failures (3 pre-existing tutorialNarration unit failures are known/unrelated - just note them). Dedicated e2e ONLY if absolutely necessary. Do NOT run the full Playwright / e2e suite. Do NOT run GPU/FPS benchmarks.

Fix TWO UX bugs (one cohesive commit is fine).

## BUG 1: scrolling over a build button changes the build stack without Shift

In the left sidebar, scrolling (mouse wheel or touchpad/trackpad) over a build/production button currently increases/decreases that button's build stack (queued count). This must ONLY happen when the Shift key is held during the scroll over the button.

- Without Shift: the wheel event must not change the stack and must not be consumed/prevented by the stack feature (do not call preventDefault/stopPropagation for stack purposes), so normal scrolling of the sidebar/page behaves as usual.
- With Shift: keep the existing increase/decrease behaviour. Note browsers often map Shift+wheel to horizontal scroll (deltaX instead of deltaY, esp. on macOS/trackpads) - handle the dominant delta axis so Shift+scroll works reliably in both directions, and debounce/accumulate trackpad deltas if the existing code does so.
- Check all places that attach wheel handlers to build buttons (e.g. src/ui/productionControllerButtonSetup.js and anything else) and any docs/tooltips/input guide (e.g. src/ui/inputMethodGuide.js, docs, tutorial text) that describe "scroll to change stack" and update them to say Shift+scroll.

## BUG 2: chain-build mode re-arms itself automatically

Sometimes after chain-build mode was cancelled with ESC, or after a build was aborted or finished, chain-build mode turns itself on again automatically for the next build, and keeps doing so. Chain-build mode must NEVER auto-enable: it has to be explicitly enabled by the user every single time.

- Investigate the real root cause (verify, don't guess): look at chain-build/planning state in src/gameState.js, src/productionQueue.js, src/ui/productionControllerButtonSetup.js, src/ui/eventHandlers.js, src/input/keyboardHandler.js, src/game/gameOrchestrator.js, src/rendering/uiRenderer.js, src/saveGame.js etc. Possible causes (non-binding hypotheses): stale per-building/per-button chain flags or a "remembered" chain preference copied into the next build, the ESC/abort/complete paths clearing only part of the state, a re-arm in placement-complete / ready-for-placement handlers, or save/load restoring it.
- After ESC cancel, build abort/cancel, or build completion/placement, all chain-build state must be fully cleared, and the next build must start with chain-build off unless the user explicitly enables it again.
- Keep the explicit enable flow working as before.

## Tests

Add focused unit tests: (1) wheel without Shift does not change stack and is not prevented; wheel with Shift changes stack up/down (including deltaX-only Shift wheel). (2) chain-build stays off after ESC cancel, after abort, and after completion, for the next build, until explicitly enabled.

## Done when

- Lint passes; focused tests (+ test:unit if required) pass.
- docs/changes entry + prompt-history file added; features/unreleased updated if that is the repo convention.
- Final message: short summary of root causes, fixes, files touched, test/lint results.

## Follow-up review (Grok Bot executor, applied on top of the Codex result)

Added the stale-Shift root-cause fix for chain building (event-local `shiftKey` for drag priming, Shift reset on blur/visibility change and resync on key events), a keyboardHandler unit test, and renumbered colliding shipyard test IDs (U06500-U06502 -> U06510-U06512) so `npm run lint` passes.
