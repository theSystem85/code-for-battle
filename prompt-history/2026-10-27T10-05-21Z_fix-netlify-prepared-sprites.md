UTC: 2026-10-27T10:05:21Z
LLM: Grok Bot

Patrick asked whether everything from this morning was on `dev` yet, because he did not see all of it in the game. `origin/dev` already had the commits through the release-notes dialog, but https://dev--code-for-battle.netlify.app was still serving `68a4e506`. Every later Netlify `dev` branch deploy had failed. Local reproduction showed `npm run check:map-sprite-tiers` failing because `dtv6_decor_soil.json` and `catalog.json` under `public/images/prepared-map-sprites/` were stale after the soil lake-tag change. Regenerated the prepared map sprite tiers, verified `npm run build` and `npm run test:smoke`, and pushed the refresh to `dev` so Netlify can publish the missing features.
