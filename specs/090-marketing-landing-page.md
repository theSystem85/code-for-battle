# 090 — Marketing landing page

## Routes

- `/en/landing` — English marketing page
- `/de/landing` — German marketing page
- `/landing` — chooses a locale, then replaces the URL

Locale choice:

1. `localStorage` key `cfb-landing-locale` (`en` or `de`), written when a locale page opens
2. Otherwise the first `de` or `en` entry in `navigator.languages`
3. Otherwise English

Both locale URLs stay valid. The in-game sidebar link under Privacy uses the same choice. Before JavaScript runs, that link points at `/landing`.

Vite dev rewrites the three paths to `src/landing/`. The production build moves the HTML to `dist/en/landing.html`, `dist/de/landing.html`, and `dist/landing.html`. `netlify.toml` rewrites the public paths onto those files ahead of the SPA fallback.

## Copy

Visible landing copy lives in `src/landing/locales/en.json` and `src/landing/locales/de.json` under `landing.*`. Markup uses `data-i18n` attributes. Feature cards, asset kinds, and the tech tree are rendered from those keys.

## Content

Screenshots are the existing WebP captures in `public/images/docs/`:

- `GamePlayDesktop(FEB2026).webp`
- `GamePlayLandscape(FEB2026).webp`
- `GamePlayPortrait(FEB2026).webp`

The tech tree matches `src/ui/productionControllerTechTree.js` and the building gates in `src/ui/productionControllerButtonStates.js`, including the naval shipyard branch that the player-guide diagram does not list yet. Icons are the sidebar WebP files.

Generated asset kinds listed on the page: unit sprites, building sprites, terrain tiles and sprite sheets, explosion animations, interface icons, command cursors, sound effects, music, narrator voice-over, and milestone videos.

The page also has a Multiplayer section and a Controllers section, in both locales, between Features and Vibe-coded. Multiplayer copy is limited to what the client implements: host invite link and QR code, WebRTC signalling, up to four parties, optional LLM commanders for empty parties, lockstep seed and input exchange with hash checks and host resync, pause-until-reconnect, Google STUN always, and TURN only when the signalling server is configured with it. Localhost invites and non-HTTPS iOS Safari are called out as limits. Controllers copy matches spec 092: mapping menu, per-controller profiles, and two-player couch co-op. The nav lists both sections.

## Performance

The page is a separate document. It does not run inside the simulation or render loop. The sidebar hook runs once at startup. Gallery images below the hero use lazy loading. The service worker cache is `code-for-battle-cache-v3` and no longer stores landing or legal navigations as the offline app shell.

This environment cannot certify 75 presented FPS. No simulation hot path was changed.

## Verify

```bash
npm run dev
```

- Open `/en/landing` and `/de/landing`
- Use the language switch
- Open `/landing` and confirm it follows the browser language, or the last landing locale visited
- In the game sidebar, confirm the new link sits under Privacy and opens the matching locale
- Footer imprint, privacy, and contact links follow the page language
