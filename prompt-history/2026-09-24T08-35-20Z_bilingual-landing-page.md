# 2026-09-24T08:35:20Z

**LLM:** Cursor Cloud Agent using Grok 4.7
**Harness:** Cursor Cloud Agent
**Tokens / duration:** exact input, visible output, and reasoning token counts are not available from this run. Wall clock from 2026-09-24T08:35:20Z through verification was about 37 minutes. `npm run lint:fix:changed` passed. `npm run test:unit` passed 186 files / 4153 tests. 75 presented FPS was not certified: this session is headless and the landing page is a separate document, not a simulation hot path.

## Prompt

Build a professional bilingual marketing landing page for Code for Battle (browser RTS) and link it from the in-game sidebar after the Privacy link.

## Goals
1. Landing page hosted on the **same Netlify domain** under a separate path:
   - `/en/landing` (English)
   - `/de/landing` (German)
   - Also support `/landing` redirecting to the user's preferred/default locale (match existing locale detection if any; otherwise default sensibly and keep both locale URLs working).
2. Add a sidebar link **at the very bottom, after the Privacy link**, pointing to the landing page (locale-aware: DE → `/de/landing`, EN → `/en/landing`).
3. Design language must be **consistent with the game UI** (colors, fonts, borders, panel/HUD aesthetic — reuse CSS variables / shared styles from the game and existing legal pages where possible).
4. Content must look **super professional for an RTS**.
5. **All user-visible labels/copy via proper i18n key–value pairs** (no hardcoded DE/EN strings in markup/JS for labels). Follow and extend the repo's existing i18n/locale patterns if present; if landing needs new locale JSON/modules, structure them cleanly (e.g. `landing.*` keys) with full EN + DE.

## Required page sections
- Hero: game name, strong tagline, clear CTA to play (`/` or main game entry).
- Gameplay screenshots gallery (use real screenshots already in the repo if available under `public/`, `docs/`, `output/`, or similar; if none exist, generate tasteful placeholder frames that still look professional and document where real shots should go — prefer real assets).
- **Features**: list the game's **current** features (investigate README, Documentation.md, specs, UI production menus, multiplayer, naval, milestones, save/load, etc. — be accurate, not aspirational vaporware).
- **Vibe-coded highlight**: emphasize this is a fully vibe-coded game and that **assets were generated**. Explicitly list **all kinds of assets** used/generated (investigate repo: unit/building sprites, tiles/map art, SFX, music, narrator VO, milestone videos, UI icons, cursors, etc.).
- **Tech tree**: show the game's tech/production tree **like in the docs** (find the canonical tech-tree diagram/description in docs / Documentation.md / AI_Docs / specs and render it clearly on the page — visual diagram preferred, accessible markup).
- Footer with legal links consistent with existing imprint/privacy routing.
- Language switcher between `/en/landing` and `/de/landing`.

## Technical constraints
- Match existing patterns for static/legal pages (`src/legal/`, `docs/legal-pages.md`, Vite multi-page entries, Netlify redirects). Extend Vite build + `netlify.toml` redirects so `/en/landing` and `/de/landing` work in production (SPA fallback alone may not be enough if landing is a separate HTML entry — choose the approach that fits this repo).
- Keep performance reasonable (lazy images, compressed screenshots).
- Do not break the game or existing legal pages.
- Open a PR with summary + how to verify (`/en/landing`, `/de/landing`, sidebar link after Privacy, i18n keys, locale switch).
