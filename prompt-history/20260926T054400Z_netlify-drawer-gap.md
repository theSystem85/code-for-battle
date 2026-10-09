# 2026-09-26T05:44:00Z

Grok 4.7, Cursor Cloud Agent. Token counts were not available for this run. The prompt was recorded at 2026-09-26T05:44:00Z and the change was ready to commit at 2026-09-26T05:59:56Z.

## Prompt

User tested the latest #712 preview in Chrome on iOS, portrait: it now STARTS correctly with no gap, but after ~1-2 seconds the bottom gap reappears, at about the same time the Netlify deploy-preview overlay/toolbar (Netlify Drawer / collab toolbar injected into deploy previews) appears.

Investigate and fix:
1. Determine what the Netlify preview toolbar injects (iframe/div, position: fixed, bottom-anchored? size?) and whether that element itself makes Chrome iOS shrink the layout viewport by its height (same mechanism as the build bar bug), or whether its injection just fires resize/visualViewport/ResizeObserver events that make OUR sizing code (the remeasure on resize/scroll/focus/visibility, ResizeObserver on root/body, visualViewport handling, --app-height style vars) compute a smaller height and never recover.
2. Simulate it: in Playwright, load the preview-like page at 390x844 with a CriOS user agent, then after 1.5s inject a fixed bottom element / iframe similar to Netlify's (and also emulate the viewport shrinking by that element's height) and check whether the canvas + build bar still reach the bottom. Also try with the real preview URL https://deploy-preview-712--code-for-battle.netlify.app if reachable.
3. Make our layout robust regardless: the game root/canvas/build bar must fill the actual visible webview after any later resize, and must recover when the viewport grows back. Avoid sizing logic that latches onto a smaller value. Do not rely on the Netlify toolbar being absent, but you may also note if the gap would not exist on production (no toolbar).
4. Rebase on main, no merge commits, push --force-with-lease to the same branch. Run unit tests and lint.

Report: what the Netlify overlay is, the exact mechanism that brought the gap back (file/line), the fix, whether production (no toolbar) was ever affected, and screenshots before/after the simulated injection under /opt/cursor/artifacts/screenshots/.
