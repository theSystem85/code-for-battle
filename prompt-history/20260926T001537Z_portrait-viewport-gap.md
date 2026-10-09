# 2026-09-26T00:15:37Z

Grok 4.7, Cursor Cloud Agent harness.

Token counts and exact elapsed time were not available for this run, so they are omitted.

## Prompt

Bug (see attached iPhone screenshot, Chrome on iOS, opened from the GitHub app, Netlify preview of the game): on initial load in PORTRAIT on a phone, there is a large unused black area at the bottom of the screen, below the portrait build bar (Power Plant / Street buttons) and above the browser toolbar, roughly 120px tall. After rotating the device to landscape and back to portrait, the gap disappears and the layout is correct. It must be correct initially, without reorientation.

Likely cause: the game/HUD layout computes the viewport height once at startup (window.innerHeight / 100vh / screen size / visualViewport) before the mobile browser chrome has settled, and only recomputes on orientationchange. Investigate the mobile portrait layout code (canvas sizing, HUD/sidebar/build-bar positioning, CSS vh vs dvh, any cached viewport height or --vh custom property) and fix it robustly:

- Use dynamic viewport units (100dvh with 100vh/-webkit-fill-available fallbacks) or a correctly updated CSS variable.
- Recompute layout on resize, visualViewport resize, orientationchange, pageshow (bfcache), and after load/first frames (e.g. a rAF double-tick plus a short settle), debounced, without causing layout thrash or affecting the frame loop.
- Ensure the canvas/backing store resizes correctly and the build bar is anchored to the actual bottom (respect env(safe-area-inset-bottom)).
- Works in iOS Safari, Chrome iOS (WKWebView), in-app browsers (GitHub app), and as an installed PWA (standalone), and Android Chrome.

Verify: add unit tests for the viewport/resize logic. Use Playwright with iPhone device emulation (390x844 and 430x932) to screenshot the initial portrait load with no reorientation; also simulate a viewport height change after load (e.g. start with a smaller innerHeight then grow, as when browser chrome collapses) and confirm the layout fills the screen with no bottom gap. Mark the tutorial completed before screenshots. Include screenshots in the PR description and final report.

Keep `npm run test:unit` and lint green. Follow AGENTS.md: rebase only, never merge main into the branch, push with --force-with-lease. Note PR #709 (full-screen modals on phone portrait, branch cursor/phone-portrait-fullscreen-modals-4685) is open and not yet merged; stay focused on the game layout, not modals, to avoid conflicts. Open a draft PR and report the root cause, the fix, the PR URL and screenshot paths.
