# Choose how you command the battlefield

The tutorial first asks which controls you use: mouse and keyboard, trackpad, touch, or gamepad. Your choice is remembered in this browser and changes the tutorial's instructions and demonstrations; it does not disable other connected devices. Change the choice in the tutorial when you switch devices. Use Open control settings in the tutorial to open Settings → Key Bindings for your actual keyboard bindings or Settings → Controllers for the active gamepad profile. Use Refresh mappings after changing settings to update the guide labels. Examples below describe defaults, so your saved mappings take precedence.

| Method | Select | Command | Move the camera |
| --- | --- | --- | --- |
| Mouse + keyboard | Primary click or drag a selection box; Shift-click adds/removes | Select first, then primary-click ground/enemy to move/attack; Shift-primary queues | Hold secondary button and drag; wheel scroll; arrow keys when not steering a selected unit |
| Trackpad | Primary click or press-and-drag; Shift adds to selection | Primary click after selection; two-finger secondary click cancels/opens context | Two-finger scrolling over the map; Shift-wheel for horizontal movement; secondary-click hold and drag; hand-button fallback below |
| Touch | Tap; double-tap selects visible units of the same type | Tap a destination or enemy with units selected | Drag the map with two fingers; use the mobile controls and virtual joysticks for a selected friendly unit |
| Gamepad | Player 1's cursor and mapped primary/secondary actions | Use the active profile's command and remote-control bindings | Default right stick pans the map outside aiming mode; profile/context decides the action |

## Trackpad: pan without leaving the game

Place the pointer over the battlefield canvas and scroll with two fingers. Horizontal and vertical wheel deltas move the camera on both axes. Pixel deltas move one CSS pixel per delta; line deltas use 16 CSS pixels and page deltas use the canvas viewport dimensions. Browser/OS momentum is retained; the game adds no extra inertia. The game consumes cancelable wheel events delivered to the map, including when the camera reaches a map edge, to prevent their page scrolling or boundary navigation. Ordinary scrolling inside Settings or another scrolling panel remains available.

If your hardware sends only vertical wheel movement, hold Shift while scrolling for horizontal movement. For a drag fallback, click the **hand button (Drag to pan map)**, then press and drag with the primary button. The button stays active until you switch it off or press Escape; turn it off before selecting units or issuing ordinary clicks. Entering Sell or Repair also leaves hand mode. Shift-primary drag keeps its additive-selection role when hand mode is off. You can also hold a secondary click and drag to pan; a brief secondary click deselects or opens the contextual menu instead.

On macOS, secondary click is usually a two-finger click. In **System Settings → Trackpad → Point & Click**, check **Secondary click** and choose the gesture you prefer. A tap only acts as a click when **Tap to click** is enabled. Press/hold the secondary click while dragging if a light tap does not maintain a drag.

If a horizontal swipe goes back or forward in Safari or Chrome, open **System Settings → Trackpad → More Gestures → Swipe between pages** and turn it off or choose a gesture that does not conflict. Check **Trackpad → Scroll & Zoom → Natural scrolling** when direction feels reversed. Names and options vary between macOS releases. The game follows the scroll deltas the browser delivers; it cannot change the system's gesture assignment.

Some operating-system or browser gestures are consumed before a wheel event reaches the page. Preventing a delivered event cannot stop a gesture the game never receives. Use the hand-button or secondary-drag fallback in that case. Ctrl/Meta-wheel over the canvas is consumed without moving or zooming the camera, so trackpad pinch-wheel does not become an accidental pan or browser zoom. In the map editor, wheel input still adjusts the brush instead of panning. Keep the browser scale at your preferred normal setting.

## Arrow keys: accelerator-style camera

When no selected unit is using the direction keys for steering, hold a direction to accelerate the camera up to its configured maximum. Release to brake quickly, or press the opposite direction to decelerate before reversing. Each axis behaves independently, so releasing one diagonal direction brakes that axis while the other continues.

Open **Runtime Config → Controls** (default shortcut **K**, shown in Key Bindings if remapped). Adjust **Keyboard Scroll Maximum Speed**, **Keyboard Scroll Acceleration**, **Keyboard Scroll Reversal Deceleration** and **Keyboard Scroll Automatic Braking**. Acceleration/braking use pixels per second squared; higher values act faster. The existing speed setting uses a 60 Hz reference: 8 means 480 pixels/second. Defaults accelerate to that speed in 0.4 seconds and stop after release in about 0.13 seconds. Set automatic braking to zero only if you prefer continued coasting. Mouse/trackpad and gamepad controls retain their existing behavior.

## Touch: mode comes before a building's shortcut

The tutorial uses touch instructions when you choose touch, even when another device is available. In Sell mode, tapping an owned building sells it rather than opening a waypoint or factory shortcut. Leave Sell mode before using those shortcuts. Likewise, exit Repair or placement modes before ordinary selection. Keep the current tutorial's visual hint beside the map rather than treating a desktop secondary-click instruction as a touch action.

## Gamepad: use your active profile

Connect a controller, then check Settings → Controllers. Player 1 can move the cursor; a second controller can remote-control another unit of the same side. Defaults use the left stick for the cursor or remote movement, the right stick for map movement or aiming, and mapped primary/secondary actions for primary commands and secondary cancel/context actions. Stick mode and context matter: an aiming stick does not simultaneously pan the map.

Profiles, remapped buttons and deadzones are saved in this browser. The tutorial's gamepad prompts should show your active bindings, not assume Xbox/PlayStation face-button names. Press a controller button if the browser has not yet exposed the connected controller. Keep the keyboard and pointer available while selecting a profile or troubleshooting the connection.

## Check the controls on a physical Mac

These steps require a real macOS trackpad; Linux synthetic wheel tests cannot certify them. Record Mac model, macOS version, browser/version, system gesture settings and observed results.

1. In Safari and then Chrome, load a battle with room to pan. Select Trackpad in the tutorial and reload: confirm the choice persists and trackpad hints appear.
2. Scroll horizontally, vertically and diagonally over the map, then continue at every map boundary. Confirm the camera pans when movement is available, the page stays still and browser history does not navigate for delivered gestures.
3. Repeat with natural scrolling on/off. Record direction and any browser/OS gesture that bypasses page events; test with Swipe between pages disabled/remapped too.
4. Test Shift-wheel horizontal panning and the hand-button primary-drag fallback. Switch the hand button off and confirm primary/Shift-primary selection and brief secondary-click deselection/context still work.
5. Test two-finger secondary click and hold-drag using your enabled macOS click settings. Check movement/attack commands are not accidentally issued after a camera drag.
6. Scroll a Settings list and the documentation page: confirm ordinary panel/page scrolling still works. Switch tutorial input methods and verify current keybindings/gamepad profile hints survive reload.
7. On a touch device, enable Sell and tap a waypoint-capable owned building: confirm selling takes priority; turn Sell off and confirm its normal waypoint interaction returns.

**Physical macOS Safari/Chrome acceptance: pending.** Automated checks cover wheel-event behavior and tutorial preference logic; they do not prove system-level gesture interception or real hardware behavior.
