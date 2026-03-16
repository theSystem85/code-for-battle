# Restore Missing Enclosed Island Notch SOT

**UTC Timestamp:** 2026-03-15T07:38:32Z  
**LLM:** Copilot (GPT-5.4)

## Prompt

> missing grass SOT here (see image). ENSURE to NOT make the game startup time significantly slower! ENSURE NOT to get regression regarding other SOT tiles besides the islands detection!

## Summary of Changes

- Replaced repeated island flood-fill checks with cached connected-component analysis shared across SOT mask generation and incremental updates.
- Relaxed inverse island corner detection to match enclosed orthogonal island tiles from the same component, fixing missing grass/street notch smoothing without widening ordinary coastline SOT.
- Added focused unit coverage for the diagonal-water notch case while keeping the existing non-island and inverse-island regression tests intact.