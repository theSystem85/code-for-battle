2026-09-26T19:54:00Z
Cursor Cloud Agent using Grok 4.7 took about 10m (token counts unavailable)

Bug: when no gamepad is connected, a leftover fragment of the gamepad availability overlay/indicator stays visible on the game screen: a small black notch/pill with a green dot (the P1/P2 controller indicator from the gamepad support work, PR #706/#707). Requirement: the gamepad indicator must be visible ONLY while at least one gamepad is actually connected; otherwise it must be completely hidden (not rendered or display:none, no background, border, notch, dot, padding, shadow or empty container left over). Each per-player pill should only show for its connected controller. Handle: initial load with no gamepads, connect then disconnect (gamepadconnected/gamepaddisconnected), page reload after disconnect, and browsers that report null slots in navigator.getGamepads(). Check both desktop and phone (portrait and landscape) layouts, and that no other element (e.g. a wrapper, a CSS ::before/::after, or the remote-control/crosshair UI) produces the notch.

Find the root cause (which element renders the black notch with the green dot when nothing is connected) and fix it. Add/adjust unit tests for the visibility logic. Run `npm run test:unit` and ESLint on changed files.

Visual proof required: take screenshots (save under /opt/cursor/artifacts) of (1) the game with no gamepad connected showing no indicator at all, zoomed/cropped on the area where the notch used to be, and (2) with a simulated connected gamepad showing the indicator correctly, and (3) after simulated disconnect, hidden again. Reference those screenshots in your final report.

Repo rules (see AGENTS.md): no merge commits; branch from latest main, rebase onto main if needed, push with --force-with-lease. Open a PR to main with a clear description.
