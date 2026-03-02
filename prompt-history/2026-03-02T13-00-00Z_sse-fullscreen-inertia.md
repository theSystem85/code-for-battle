# Prompt History Entry
- UTC Timestamp: 2026-03-02T13:00:00Z
- Processed By: copilot

## Prompt
More things to refine regarding SSE:
1) make the SSE full screen by default. no more need to support a non full screen of it (remove the maximize button)
2) implement the functionality of the SSE canvas zoom buttons (nothing happens when they are clicked at the moment)
3) ensure by default the sprite sheet in the canvas is shown in "snap to canvas" mode which mean the full image is fitted into the size of the canvas.
4) instead of showing the y and x scrollbars for the canvas use the same scrolling mechanics that apply for the map in the game (right click + drag => scroll into drag direction with inertia)
5) Make sure to not waste any space in the UI of the SSE for paddings and margins around the sidebar or the canvas. Both snap to the very edges of the screen and at each other! For the SSE sidebar use the same background styles as for the games normal sidebar.
6) remove the entire top bar with the close button to gain space for sidebar and canvas. Move the close button to the bottom of the sidebar instead to the left of the apply button
