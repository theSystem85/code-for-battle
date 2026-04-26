UTC timestamp: 2026-04-26T20:07:46Z
LLM: codex

User request:

1. Ensure `"full"` tagged street SOT tiles only use other `"full"` tagged images from the sprite sheet, not the old default isolated street tile.
2. Ensure `"full"` tagged street images for SOT tiles are used when water is around, including when a water tile is below the SOT tile and both street neighbor tiles are also `"full"` streets.
3. Re-analyze the attached screenshot because the prior T-crossing fix caused 4-way crosses to appear as T-crosses with a left-side gap, while T-crosses could render as 4-way crosses.
4. Fix the underlying issue rather than only swapping visible tags.
