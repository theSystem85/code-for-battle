# 2026-09-25T23:27:00Z

Grok 4.7, Cursor cloud agent harness. Token counts and reasoning-token totals were not exposed by this harness, so they are omitted. The prompt arrived at 2026-09-25T23:27:00Z. Elapsed time through commit was about 24 minutes.

## Prompt

Overhaul the gameplay screenshots used on the landing page (/en/landing and /de/landing) and in the docs. The current images (showing gameplay on different devices and orientations: desktop, tablet, phone portrait/landscape etc.) still show the OLD map design from before the map/terrain overhaul (organic coastlines/lakes, per-biome decorative tiles, rocks, cliffs).

Tasks:
1. Create a compelling built-in savegame called "demo", stored and shipped as a default/built-in save game in the same way the missions are (find how missions/default saves are registered and follow that pattern; make it loadable from the normal load UI, with en/de labels if saves have labels). The map must have mixed biomes, rocks, cliffs and water (lakes/coast). The scene: an active combat between two parties, with all kinds of units from BOTH parties on land, air and water (tanks and other ground vehicles, infantry if present, aircraft/helicopters, naval units), plus bases/buildings so it looks like a real RTS battle. Prefer generating it deterministically via a script/test helper (commit the script) so it can be regenerated later.
2. Load the demo save, let combat start (projectiles, explosions, units engaging), and take screenshots at the moments/framings that look best for a landing page. Hide debug overlays, FPS/performance widgets, tutorial panels and cursors unless intended. Reproduce each existing device/orientation variant currently used on the landing page and docs (same slots, sizes/aspect ratios, and any device frames), using real viewport sizes for each device. Use WebP (or the format the landing page already uses) with sensible quality/size.
3. Replace references to the old images in the landing page (both languages) and docs, and DELETE the old image files (make sure nothing else references them; grep the repo).
4. Add a very large, high-resolution gameplay screenshot as the landing page background: shown with a light blur and a subtle parallax effect while scrolling. Keep text readable (dark overlay/gradient if needed), respect prefers-reduced-motion (no parallax), make it performant (transform/translate3d, no scroll-jank, lazy/efficient loading, responsive sources for mobile), and ensure it works on mobile Safari.
5. Verify visually: take screenshots of the finished landing page (en and de) at desktop 1440x900, tablet, and phone 390x844, top and scrolled (to show parallax), inspect them yourself and iterate until it looks polished. Include them in the PR description and final report.

Keep `npm run test:unit` and lint green, update any relevant spec/docs. Follow AGENTS.md: never merge main into the branch, rebase only, push with --force-with-lease. Open a draft PR and report: PR URL, where the demo save lives and how it's generated, list of replaced/deleted images, and final screenshot paths (including the new gameplay screenshots themselves).
