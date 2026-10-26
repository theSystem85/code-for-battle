# Prompt history

- UTC timestamp: 2026-10-26T15:27:13Z
- Model: Codex using GPT-5.6 Sol
- Harness: Codex

## Prompt

Work only from the `dev` result branch, commit the result, do not open a pull request, use English and Conventional Commits, and follow the applicable `AGENTS.md` rules. Investigate and fix the regression introduced by `c57fb51c` that prevents decorative map tiles from rendering. Preserve opportunistic idle preparation during scrolling, stable published in-viewport pages, off-screen cancellation only for unfinished work, immediate rendering of every non-decoration layer, and the absence of placeholders. Add regression unit coverage with and without `requestIdleCallback`, including guaranteed forward progress for a still camera under short idle deadlines.

Also make decorative sprites load their existing prepared coarse atlas tier first and then upgrade in place to the final tier by reusing the existing sprite-streaming and map-sprite-tier pipeline. Preserve placement, collision, and logical geometry, and never blank decorations during the swap. Run lint and applicable unit/integration tests, do not run the full Playwright suite or software GPU/FPS benchmarks, record the change and unreleased release notes, and report the root cause, implementation, files, and test results.

## Follow-up (orchestrator review before landing)

- Model: Grok Bot (orchestrator), reviewing and amending the Codex result.
- Prompt (Patrick Beyer): "now I do not see any decorative tiles anymore at all so you need to make sure they get rendered again with the new rendering improvement. Also consider loading a decorative sprite in low resolution first (requires extra low resolution sprite sheets are built and can separately be loaded)."
- Amendments: idle-callback timeout, 3 ms still-camera budget, decorative re-key on sprite-tier publication, no downgrade of resident final pages.
