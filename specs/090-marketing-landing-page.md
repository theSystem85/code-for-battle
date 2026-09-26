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

Screenshots are WebP captures of the built-in `demo` save (`builtin:demo`) after combat has started. Regenerate the save with `node --import ./scripts/demoSaveRegister.js scripts/generateDemoSave.js`, then recapture with the dev server running and `node scripts/captureLandingScreenshots.mjs`.

Slots keep the previous viewport sizes:

- `GamePlayDesktop.webp` — 1254×784 desktop
- `GamePlayLandscape.webp` — 845×392 phone landscape
- `GamePlayPortrait.webp` — 391×846 phone portrait

`GamePlayBackdrop.webp` (1920×1080) and `GamePlayBackdropMobile.webp` (960×540) are the fixed page background. The background image is blurred, covered by a dark gradient so the copy stays readable, and shifted with `translate3d` on a wrapper (not on the filtered image) by at most 8% of the viewport. The wrapper is larger than the viewport on every side, so that shift never uncovers the page color. The sticky header is a sibling of that layer and stays at the top of the viewport. Landing scroll behavior is instant, because smooth scrolling painted a gap above the header. `prefers-reduced-motion: reduce` leaves the backdrop still. The mobile source is selected with a `picture` media query. The image is decoded asynchronously at low fetch priority so it does not compete with the hero shot.

Gallery cards size to their screenshots. On wide layouts the desktop and landscape shots stack on the left and the portrait shot sits beside them.

The February 2026 captures were removed. They showed the map from before organic coasts, biomes, rocks, and cliffs.

The tech tree matches `src/ui/productionControllerTechTree.js` and the building gates in `src/ui/productionControllerButtonStates.js`, including the naval shipyard branch that the player-guide diagram does not list yet. Icons are the sidebar WebP files.

Generated asset kinds listed on the page: unit sprites, building sprites, terrain tiles and sprite sheets, explosion animations, interface icons, command cursors, sound effects, music, narrator voice-over, and milestone videos.

The repository link is `https://github.com/theSystem85/code-for-battle` (`GITHUB_REPO_URL` in `src/landing/sidebarLink.js`). English and German are the supported landing locales.

- Header, on the right, after the language switch and before Play: a button with an inline GitHub mark SVG (no external icon request) and `landing.nav.github` ("View on GitHub" / "Auf GitHub ansehen").
- Footer, after imprint, privacy, contact, the player guide, and launch: the same label and mark. Those existing footer links stay in that order.
- In-game sidebar, inside the small footer links, after Privacy and before the landing link: `landing.nav.githubShort` ("GitHub" in both locales), styled like the other footer links.

Each of those links opens in a new tab with `rel="noopener noreferrer"`. Section nav order (gallery through tech) is unchanged.

The page also has a Multiplayer section and a Controllers section, in both locales, between Features and Vibe-coded. Multiplayer copy is limited to what the client implements: host invite link and QR code, WebRTC signalling, up to four parties, optional LLM commanders for empty parties, lockstep seed and input exchange with hash checks and host resync, pause-until-reconnect, Google STUN always, and TURN only when the signalling server is configured with it. Localhost invites and non-HTTPS iOS Safari are called out as limits. Controllers copy matches spec 092: mapping menu, per-controller profiles, and two-player couch co-op. The nav lists both sections.

## Performance

The page is a separate document. It does not run inside the simulation or render loop. The sidebar hook runs once at startup. Gallery images below the hero use lazy loading. The backdrop listens to scroll with a passive listener and writes one composited transform per frame. The service worker cache is `code-for-battle-cache-v3` and no longer stores landing or legal navigations as the offline app shell.

This environment cannot certify 75 presented FPS. No simulation hot path was changed. The parallax change is limited to the marketing document.

## Verify

```bash
npm run dev
```

- Open `/en/landing` and `/de/landing`
- Use the language switch
- Open `/landing` and confirm it follows the browser language, or the last landing locale visited
- In the game sidebar, confirm the new link sits under Privacy and opens the matching locale
- Footer imprint, privacy, and contact links follow the page language
- Header and footer show "View on GitHub" in English and "Auf GitHub ansehen" in German, and both open the repository in a new tab
- The game sidebar shows GitHub after Privacy and before the landing link, also in a new tab
