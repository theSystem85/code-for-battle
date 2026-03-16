# Fill Missing Enclosed Island Shoulder SOT

**UTC Timestamp:** 2026-03-15T09:54:23Z  
**LLM:** Copilot (GPT-5.4)

## Prompt

> here are 2 SOT tiles of grass missing to overly the water. Make it consistent so that the 3x3 cross island in the middle gets round.

## Summary of Changes

- Extended inverse enclosed-island SOT matching to cover diagonal shoulder patterns using the same cached enclosed-component analysis.
- Added focused unit coverage for the missing two-grass-tile shoulder case while preserving the earlier island, notch, and coastline regression tests.
- Kept the shared component cache so startup cost stays flat instead of adding more repeated island scans.