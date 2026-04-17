# UTC Timestamp
2026-04-17T10:36:43Z

# LLM
codex (GPT-5.3-Codex)

# Prompt
ensure all sprite sheets in public/images/map/sprite_sheets can be used combined depending on the tags that are used in the corresponding json file for each webp file (they share the same filename). so each webp sprite sheet has its own json file with tags. the game map rendering engine should comine all available sprite sheets that have at least one tag (untagged should not be loaded to save memory). so for example if there are rocks in sprite sheet A and also in B then the map renderer will combine rock tiles from A and B randomly mixed. Ensure the local storage json tag files overrule the default ones. Multiplayer only supports the default sprite sheets (there is no sync between the clients and the host). The sprite sheets are just cosmetic and should have no impact on the game logic at all! ensure for rocks now the blend mode is supported so that rocks get placed on the selected biomes ground tile (like grass or soil) and then blended on top of it (like it already works with ore tiles).

Also ensure that the user can now in the map settings check and uncheck sprite sheets to be used in a list of all available sprite sheets. so only the checked ones get used for map tiles in the game. that list is only visible below the checkmark "use custom sprites" when it is on. the list has a max height of 5 items.
