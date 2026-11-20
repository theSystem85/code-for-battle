# Units tab hold menu

Hold the Units production tab for at least 500 ms with the primary mouse button or a finger. In the compact mobile layout, hold the category control while it displays Units. The menu lists living units belonging to the local player, newest first, and initially centers the selected unit or the newest unit. A short click or tap retains its production-tab action.

Each entry displays the unit name above five icon-labeled values for age, HP, fuel, ammunition, and XP. Age uses simulation time and pauses with the game. Older units with no recorded creation or production time display a dash for age.

Move into the list while holding. The scroll direction follows the pointer above or below the center, and speed increases toward the edges. The row nearest the center remains highlighted. Release to focus and select the highlighted unit. Pointer cancellation, window blur, and resizing dismiss the menu without selecting.

Settings → Runtime Config → Units tab hold menu remembers the maximum visible units (5 by default) and the maximum scroll speed (12 units per second by default). A short list or a small viewport reduces the menu height.

## Verification

- Hold for 500 ms, move from the center toward each edge, and release. Check that the highlighted unit becomes the sole selected unit and the map focuses on it.
- Repeat with a touch gesture on the compact mobile control. Check that a short tap still switches categories.
- Change both Units tab hold menu settings and reopen the menu. Check that the visible row count and scroll rate follow the saved values.
- Browser interaction checks covered the gesture with mouse and touch, ownership filtering, row height, and click suppression.
- The picker does work only while the gesture is active. It moves a single track per animation frame and changes at most two highlight attributes as the center row changes. The 75 FPS acceptance check remains pending on qualifying GPU hardware.
