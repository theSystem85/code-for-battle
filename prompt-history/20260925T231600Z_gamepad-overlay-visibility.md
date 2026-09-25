2026-09-25T23:16:00Z
Cursor Cloud Agent using Grok 4.7

One more change on PR #707 (same branch cursor/gamepad-cursor-toggle-scroll-f06d): the in-game gamepad player overlay (P1 / P2 lights) must only appear when a gamepad is actually connected, and only show chips for connected players. No gamepad connected: overlay fully hidden (no empty container, no 'not connected' chips). One pad: only P1. Two pads: P1 and P2. It must update live on gamepadconnected/gamepaddisconnected. (The Controllers settings tab may keep showing slot status, that's fine.) Add/adjust unit tests, keep `npm run test:unit` and lint green, rebase onto latest origin/main if it moved (rebase only, --force-with-lease), push, and mark the PR ready for review. Report the final head SHA.
