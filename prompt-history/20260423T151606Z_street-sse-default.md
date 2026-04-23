# Prompt History
- UTC Timestamp: 2026-04-23T15:16:06Z
- Model: GPT-5.3-Codex

## Prompt
update the streets rendering so that by default the images/map/sprite_sheets/streets23_q90_1024x1024.webp (ensure to add this default sprite sheet to the SSE sheet selector as an option to choose) sprite sheet is used to render the street tile on the map based on the associated tags (top, bottom, left, right, street) use these tags to choose for each rendered map tile which matching tile from the sheet to choose from so that "top" tagged tiles are chosen only when there is a top neighbour street tile and "left" only when there is a left neighbour street tile and so on. Also consider that multiple tags can be valid at the same time so you have to choose the tile from the sheet that matches the most valid tags. Ensure to for now disable the rendering of SOT for street tiles only. the street tiles to be rendered also must consider the matching biome tag to be set like "grass" or "soil" or "snow" or "sand"
