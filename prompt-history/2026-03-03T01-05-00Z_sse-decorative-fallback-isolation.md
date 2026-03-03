# 2026-03-03T01:05:00Z

- LLM: copilot
- Prompt summary: Ensure non-SSE decorative land tiles are only used as fallback when no selected-biome+decorative SSE tiles are available, and prevent mixed decorative sources.

## Requested fixes
- For decorative land-class tiles, prioritize `<selected-biome> + decorative` SSE candidates.
- Use legacy non-SSE decorative fallback only when that candidate set is empty.
- Prevent mixed decorative sourcing when SSE decorative candidates exist.
