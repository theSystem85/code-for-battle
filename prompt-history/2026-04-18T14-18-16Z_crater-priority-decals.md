# Crater Priority and Default Combat Decal Fallback

**UTC Timestamp:** 2026-04-18T14:18:16Z  
**LLM:** Copilot (GPT-5.4)

## Prompt

> ensure a "crater" cannot be overwritten by an "impact". Also ensure that when a howitzer fires it will always leave a crater on that tile. Also ensure craters, impact and debris decals will also work when custom sprite sheets are disabled then just using the default sprite sheet config file "images/map/sprite_sheets/debris_craters_tracks.json"

## Summary of Changes

- Updated tile decal replacement rules so an existing `crater` decal is preserved when a later `impact` event lands on the same tile.
- Updated bullet decal stamping so howitzer-fired artillery shells place `crater` decals on the impact tile instead of `impact` decals.
- Added bundled combat decal sheet fallback support in the texture manager so decal-tagged tiles come from `images/map/sprite_sheets/debris_craters_tracks.json/.webp` whenever active custom sheets are disabled or do not provide decal tags.
- Switched map decal rendering to use the new decal-candidate lookup instead of only the active integrated custom-sheet buckets.
- Added focused regression coverage for crater priority, howitzer crater stamping, and bundled combat decal fallback behavior.
