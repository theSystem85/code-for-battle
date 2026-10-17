# 2026-10-15T14:00:00Z

Grok Bot (executor agent; exact underlying model version and token counts not available to the harness).

## Prompt

Clean up the sprite sheets on PR #688: remove all custom grass, snow, land and street ground sheets and keep only the defaults and the new large decorative tile sheets. Remove the rock and rock-cliff sheets, all non-algorithmic water images, unused terrain sources, the old sprite script, stale Lighthouse reports and outdated docs. Move build-only terrain sources out of `public/`. Make the Sprite Sheet Editor share one sheet list with map settings, migrate stored settings and saved games, keep the default ground under decorations, and change map generation to place the large multi-tile decorations first from the sheet JSON before filling the rest with 1x1 decorations. Do not merge.

## Result

- Removed four sheets and three water bitmaps, moved about 3.2 MB of build-only sources to `assets-src/terrain/`, removed `rocks.webp`, `make:sprites` and the Lighthouse reports.
- Shared sheet registry with retired-sheet migration for stored state and saved games.
- Organic ground always renders; decorations are cut out of their painted ground and drawn on top.
- Anchor-based multi-tile placement first, then 1x1 fill; post-hoc group matching removed. Frozen lakes still block movement.
- Water is procedural only; the classic toggle is gone.
