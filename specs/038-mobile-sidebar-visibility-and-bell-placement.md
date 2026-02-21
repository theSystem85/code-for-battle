# 038 - Mobile Sidebar Visibility and Notification Bell Placement

## Context
- Date: 2026-02-21
- Prompt Source: on some browsers and in Chrome mobile emulator the sidebar and toggle can disappear; ensure sidebar access remains visible and move notification bell to top-left on mobile landscape to avoid overlap.
- LLM: GPT-5.2-Codex

## Requirements
1. Ensure mobile sidebar controls always leave a reachable sidebar entrypoint (at least the toggle button) visible, including in mobile landscape mode.
2. Preserve portrait behavior where the toggle may hide only when expanded and unnecessary.
3. Move notification bell button to the top-left area in mobile landscape so it does not overlap sidebar controls.
4. Align notification history panel placement with the moved bell anchor in mobile landscape.

## Validation Notes
- Verify `setSidebarCollapsed` does not force-hide the sidebar toggle in mobile landscape.
- Verify mobile landscape CSS positions the bell and history panel away from sidebar controls.
- Run `npm run lint:fix:changed` after implementation.
