# 2026-08-09T21:03:54Z

**LLM:** Codex

## Prompt

Bugfix: ensure water and air units when build can also be stack cancelled when the lower part of the button is clicked/tapped. Make it the same way the buttons for ground units work. Bug description: currently when air or water units are produced they cannot be cancelled/stack decreased anymore by just clicking the lower half of the button. Ensure it works for all unit build button in all viewport orientations and for click and tap.

Also ensure that quickly tapping or clicking on a build button increases or decreases the stack count. currently it only works when I do it slowly like every 500 or 1000ms. But I want to be able to smash the build button in order to increase or decrease the stack count depending on if I hit the upper or lower part of the button.

Also ensure the when the unit build button is released while a scroll event on the action bar has happened that no changes to build stack happen. Either only scrolling (when tap hold move left or right and tap releases) OR tap and immediate release for build without any scrolling.
