# 092 — Gamepad and controller support

## Requirements

The browser Gamepad API drives the same commands the mouse and keyboard already use. Up to two controllers can be connected at once. Each controller has its own mapping. The types can differ (Xbox, PlayStation, or a generic pad).

Settings gains a Controllers tab, in English and German, that matches the existing settings modal. For each connected controller the tab lists every button, stick axis, and trigger and shows a live meter while that input is held or moved. A green P1 / P2 lamp sits in the HUD and on the matching slot in the menu. A lamp is on only while that slot has a connected pad.

Player 1 owns the mouse cursor, left click, and right click. Player 2 does not move the cursor. Both players can remote-control units of the local human party at the same time. Player 2's unit stays controllable when it is off screen. The camera eases to the midpoint between the two controlled units, stays on player 1 when player 2 leaves the view, and frames both again when player 2 returns inside the view.

Controller input enters the existing remote-control, cursor, scroll, repair, sell, and attack-focus paths. Those paths already record replay commands and broadcast WebRTC messages, so lockstep sees controller input the same way it sees keyboard and mouse input.

## Controller identification

A slot stores `id` (the Gamepad `id` string), `index` (the Gamepad `index`), and `instanceKey`.

`instanceKey` is `${id}#${ordinal}`. The first pad of an id gets `#0`. A second pad with the same id gets the next free ordinal. The key is what profiles are stored under, so a library survives unplug and replug.

Reconnect order:

1. A pad whose `id` and `index` match a slot reclaims that slot and its `instanceKey`.
2. A pad whose `id` matches a disconnected slot reclaims that slot even if the browser assigned a new index.
3. A remaining pad fills the lowest empty or disconnected slot and receives an `instanceKey`. Known keys for that id are reused before a new ordinal is allocated, so a controller that was saved earlier keeps its library when it returns to a free slot.
4. A third connected pad is ignored. `ignored` counts how many pads did not fit. The poller watches Gamepad indexes 0–3, which is the range browsers use for the first four devices.

Two pads with the identical `id` that reconnect in the same poll attach to disconnected slots of that id from the lowest slot upward. Their indexes can swap. The spec accepts that swap; the libraries stay attached to the slots they land on.

Disconnect clears held buttons and axes for that slot. It does not delete the profile library or the claimed co-op unit id.

Chrome and Edge hide a pad from `navigator.getGamepads()` until the user presses a button. The menu tells the user to press a button when no pad is visible. `gamepadconnected` and `gamepaddisconnected` refresh the slot list. Safari may report `mapping !== "standard"`; the menu still lists raw button and axis indexes, and the standard-layout defaults still apply to those indexes. Firefox may expose extra axes; they appear in the live list and can be bound. They are not part of the default map.

## Default mapping

Every command has a binding on the W3C Standard Gamepad map. Reset on a player profile or a per-controller profile clears that layer so these defaults show again. The Controllers tab lists the same table under Standard layout.

Indexes: 0 A/Cross, 1 B/Circle, 2 X/Square, 3 Y/Triangle, 4 LB/L1, 5 RB/R1, 6 LT/L2, 7 RT/R2, 8 Back/Share, 9 Start/Options, 10 L3, 11 R3, 12–15 D-pad up/down/left/right. Axes 0–1 are the left stick. Axes 2–3 are the right stick. Triggers are buttons whose `value` runs from 0 to 1.

Hold LT/L2 (`remoteStickMode`) to switch the sticks. Released, the left stick is the cursor and the right stick drags the map. Held, the left stick drives the selected unit and the right stick's horizontal axis turns the turret. The vertical right-stick axis does not scroll while LT is held. Player 2 has no cursor: the left stick always drives, and LT still switches the right stick from map drag to turret. The D-pad drives in either mode, so a unit can move without giving up the cursor. LB is sell rather than the D-pad, because the D-pad is that always-available drive. RB/R1 is left free.

B/Circle is right click. When repair, sell, placement, chain build, or attack-group mode is active, B cancels that mode instead of right-clicking. Start pauses and resumes through the existing pause button, including while the match is already paused.

Player 1:

| Command | Input |
| --- | --- |
| Cursor X / Y | Left stick, while LT is released |
| Remote move X / Y | Left stick, while LT is held |
| Map scroll X / Y | Right stick, while LT is released |
| Turret left / right | Right stick X − / +, while LT is held |
| Left click | A / Cross (0) |
| Right click / cancel | B / Circle (1) |
| Toggle repair | X / Square (2) |
| Jump to last event | Y / Triangle (3) |
| Toggle sell | LB / L1 (4) |
| Remote sticks (hold) | LT / L2 (6) |
| Fire | RT / R2 (7) |
| Pause | Start / Options (9) |
| Remote up / down / left / right | D-pad (12–15) |

Player 2 uses the same face, bumper, trigger, D-pad, and pause bindings, plus:

| Command | Input |
| --- | --- |
| Remote move X / Y | Left stick, always, as an absolute wagon direction |
| Claim unit | R3 (11) |

Player 2 has no cursor or click binding. Cursor, click, and claim commands are honored only on the slot they belong to, even if a profile binds them on the other slot. A rising edge of player 2's remote move claims the selected friendly unit, or the unit under player 1's cursor, when player 2 does not already hold a unit. Claiming deselects that unit so player 1 can select another.

`cursorX` may share axis 0 with `remoteMoveX`, `cursorY` may share axis 1 with `remoteMoveY`, and `mapScrollX` may share axis 2 with `turretLeft` and `turretRight`. Those pairs are not binding conflicts. Any other shared button or axis still conflicts. An axis turret binding is read only while LT is held. A button turret binding is read all the time. Slot 0 reads the remote-move axes only while LT is held. Slot 1 reads them all the time.

## Binding

Click a command row. The next button or axis that crosses `BIND_THRESHOLD` (0.65) on a rising edge becomes the binding. Motion already past the threshold when capture starts does not bind. Escape or Cancel aborts capture and leaves the previous binding.

A button command bound to an axis stores `sign` 1 or -1. An axis command bound to an axis stores the whole axis. Binding an input that `inputsConflict` with another command clears the other command and names it in the conflict banner. Reassign confirms the steal. Cancel drops the candidate.

`inputsConflict` treats two buttons on the same index as a conflict. A whole axis conflicts with either signed half of that axis. Opposite signs of the same axis do not conflict.

Deadzone and thresholds:

- `STICK_DEADZONE` 0.18 is the fallback. `applyDeadzone` returns 0 inside the zone and scales the remainder so the output reaches ±1 at a raw value of ±1.
- Each player profile can store its own left-stick and right-stick deadzone. See Stick deadzones.
- `TRIGGER_THRESHOLD` 0.4. A button or trigger below that reads as 0 during play.
- `BIND_THRESHOLD` 0.65. Capture ignores noise below it.

## Profiles and persistence

`localStorage` key `rts-gamepad-profiles`, version 2. A version 1 store (assignments and per-controller libraries only) loads and gains empty player and controller-type catalogs. Corrupt JSON, an unknown version, or a storage failure loads an empty store.

```json
{
  "version": 2,
  "assignments": [{ "slot": 0, "id": "Xbox …", "index": 0, "instanceKey": "Xbox …#0" }],
  "playerProfiles": {
    "nextId": 2,
    "slots": ["player1", "default"],
    "explicit": [true, false],
    "profiles": [
      { "id": "default", "name": "Standard", "builtin": true, "bindings": null, "deadzones": null },
      { "id": "player1", "name": "Alex", "builtin": false, "bindings": { "fire": { "type": "button", "index": 0 } }, "deadzones": { "left": 0.2, "right": 0.18 } }
    ]
  },
  "haptics": { "enabled": true, "intensity": 0.65 },
  "suggestions": [null, null],
  "typeLibraries": {
    "xbox": {
      "activeProfileId": "default",
      "nextId": 1,
      "profiles": [{ "id": "default", "name": "Standard", "builtin": true, "bindings": null }]
    }
  },
  "libraries": {
    "Xbox …#0": {
      "activeProfileId": "default",
      "nextId": 1,
      "profiles": [{ "id": "default", "name": "Standard", "builtin": true, "bindings": null }]
    }
  }
}
```

Three layers are stored. Each can be created, renamed, and deleted. The builtin `default` profile of a layer cannot be deleted. Reset sets that profile's `bindings` back to `null`. Reset on a player profile or a per-controller profile also clears `deadzones`.

- **Player profile.** One person's layout, chosen independently for slot P1 and slot P2. Bindings use standard Gamepad indexes (buttons 0–16 and axes 0–3). The same profile can be selected on both slots. A missing key falls through. An explicit `null` means the player unbound that command. `bindings: null` means the profile sets nothing.
- **Controller-type profile.** Shared by pads of the same type: `xbox` (id contains Xbox, XInput, or Microsoft), `playstation` (PlayStation, DualShock, DualSense, Sony, vendor `054c`, or the Chrome id `Wireless Controller`), otherwise `generic`. A binding here is for a physical control that has no standard equivalent (button index above 16 or axis index above 3).
- **This controller.** The existing per-`instanceKey` library. A saved profile is a full command map. `bindings: null` means the device profile sets nothing.

Resolution for each command, first hit wins:

1. The active player profile for that slot, when the command key is present.
2. The active controller-type profile for the connected pad, when the command key is present.
3. The active per-controller profile, when that profile has a saved bindings object and the command key is present.
4. `defaultBindingsForSlot` for the slot.

Click-to-bind writes a standard logical input onto the active player profile and a non-standard input onto the active controller-type profile. A conflict is cleared on the layer that currently owns the other command.

`playerProfiles.explicit` is a pair of booleans. Choosing a player profile for a slot, including the builtin Standard profile, sets that slot's flag. A store saved before the flag existed treats a non-default slot id as explicit. Deleting the profile that a slot was using clears the flag for that slot.

## Stick deadzones

Each analog stick has its own deadzone so a resting stick does not jitter. `clampDeadzone` keeps a value in 0–0.9 and rounds it to 0.01. A non-finite value falls back to 0.18.

`profile.deadzones` is `{ left, right }` or `null`. `null` means that layer has no opinion. Resolution:

1. The active player profile for the slot, when `deadzones` is set.
2. The active per-controller profile, when `deadzones` is set.
3. `STICK_DEADZONE` (0.18) for both sticks.

Left stick is axes 0 and 1. Right stick is axes 2 and 3. Axis commands on indexes 0–1 use the left value. Any other axis uses the right value. Buttons ignore the stick deadzone and still use `TRIGGER_THRESHOLD`. The poll copies the resolved pair into a two-slot cache when the binding cache refreshes, and reuses that pair every frame.

The mapping menu shows a slider for each stick on the active player profile. Moving a slider saves immediately and does not rebuild the menu. A meter beside each slider shows `hypot` of that stick after `applyDeadzone`, quantized to 20 steps, and writes a transform only when the step changes. Reset on a player profile clears `deadzones` as well as bindings. Save-as copies the current profile's deadzones onto the new player profile.

## Haptics

`store.haptics` is `{ enabled, intensity }`. The default is on, intensity 0.65. Intensity is clamped to 0–1 and rounded to 0.01. The mapping menu has a checkbox and an intensity slider. The slider persists without rebuilding the menu and does not pulse.

`pulseGamepad` uses `gamepad.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration, weakMagnitude, strongMagnitude })`. When that actuator is missing it tries `gamepad.hapticActuators[0].pulse(value, duration)`. A missing actuator, a thrown call, or a rejected promise is ignored and the call returns false. Disabled vibration or intensity 0 returns false without touching the pad.

Pulses, not a rumble held every frame:

- Fire: rising edge of the fire binding while gameplay commands are allowed. About 70 ms.
- Damage: health of the remote-controlled unit drops. Slot 0 samples the first selected unit while that slot's remote stick is active or the unit's `remoteControlActive` is set. Slot 1 samples the co-op unit when `unit.id` matches `unitId`. A new unit id does not pulse. Repeats are at least 100 ms apart. About 120 ms.
- Menu: click-to-bind, profile select, P1/P2 slot switch, suggestion dismiss, and turning vibration on. About 28 ms. Slider drags do not pulse.

## Controller-type suggestion

When a slot becomes connected, or its instance key or index changes, `suggestControllerLayout` records a suggestion from `controllerTypeFromId` (`xbox`, `playstation`, or `generic`). The suggestion is `{ type, profileId, dismissed }`. `profileId` is the active profile of that controller-type library. The call does not change `playerProfiles.slots`.

An explicit slot stores no suggestion and returns `{ applied: false, reason: 'explicit' }`. A suggestion the player dismissed stays dismissed for the same type and returns `{ applied: false, reason: 'dismissed' }`. A different type replaces it.

The mapping menu shows one line: this controller looks like that type, that type layout is selected, and the player profile is unchanged. Dismiss sets `dismissed` and hides the line. There is no action that replaces an explicit player profile.

A per-controller saved profile stores a sanitized full map: each command for that slot is `null` or `{ type, index, sign? }` with `index` in 0–31. Unknown commands and illegal inputs are dropped. Player and controller-type profiles store a sparse map of the same input shape. Per library the user can save the active device profile, save as a new profile (`p1`, `p2`, …), load, rename, and delete. Player ids are `player1`, `player2`, …. Controller-type ids are `t1`, `t2`, ….

## Commands and existing paths

Polling runs once per animation frame at the start of `GameLoop.animate`, with a 4 ms reentry guard. Samples live in two preallocated button and axis buffers. The mapping menu, while open, asks for the same poll so the meters work. The menu writes DOM only when a quantized value changes.

| Command | Path |
| --- | --- |
| Cursor | Synthetic `mousemove` on `#gameCanvas` from a DOM cursor. Only slot 0. |
| Left / right click | Synthetic `mousedown` / `mouseup` with `button` 0 or 2 on `#gameCanvas`. |
| Map scroll | `gameState.gamepadScroll`, applied in `updateMapScrolling` with the keyboard scroll speed. Positive stick X increases `scrollOffset`. Positive stick Y moves the view down. |
| Jump to last event | `focusLastAttackEvent()`, the unit stored by the attack notification. |
| Remote D-pad and player 1 move stick | `syncRemoteControlAction` on source `gamepad:0`, merged into the existing remote-control vector. |
| Player 2 move | A per-owner co-op slot with an absolute direction `atan2(moveY, moveX)`. |
| Turret / fire | The same remote-control actions. Fire is reapplied every frame because the simulator clears the pulse after each update. Intensities are quantized to 0.05 and broadcast only when the value changes. |
| Repair / sell | The existing repair and sell mode toggles, on the rising edge. |
| Pause | A click on `#pauseBtn`, on the rising edge. This still runs while the match is paused so Start can resume. |

Gameplay commands are suppressed while the match is paused, a modal is open, replay is locked, or the local player is a spectator, defeated, or paused by the host. Capture in the mapping menu still works while settings is open.

The co-op slot is published with replay type `remote_control_coop` and rides on the existing `remote-control` WebRTC payload as `coop`, and only for the local human party. A missing `coop` field does not clear the other peer's slot. Host and client each write their own `humanPlayer` key. The host simulates; clients send the snapshot.

## Co-op camera

`computeCoopCameraFocus` is pure. Margin is 64 CSS pixels.

- No player 1 unit: mode `none`.
- No player 2 unit: mode `p1`, focus on player 1.
- Enter `both` from `p1` only when the distance fits inside the viewport minus twice the margin and player 2 is inside the viewport centered on player 1, inset by the margin.
- Stay in `both` while the absolute distance on each axis is within the full viewport. A larger separation drops to `p1`.
- `both` focuses the midpoint.

`applyCoopCamera` runs only for the local human's player 2 slot. It writes the existing `smoothScroll` target (`MINIMAP_SCROLL_SMOOTHING` 0.2) and returns true so `updateCameraFollow` does not snap. Keyboard scroll, right-drag, and gamepad map-scroll set `coopCameraHold` and return without retargeting. Releasing them resumes the eased framing.

## Multiplayer interaction

Couch co-op is local to one machine and one party: the human player's party. It is not a second network peer. Network peers keep their own cursor and remote-control stream. Because gamepad actions call `syncRemoteControlAction` / `publishCoopSlot`, they are recorded and broadcast like keyboard remote control.

## Edge cases

- Disconnect mid-game drops that slot's held inputs. The other controller keeps working. Reconnect restores the mapping.
- A third controller is ignored until one of the two slots disconnects.
- The pad is absent until the browser delivers `gamepadconnected`, which on Chromium requires a button press.
- Safari's non-standard mapping still lists raw indexes. Defaults assume the standard index layout.
- Firefox extra axes are bindable and otherwise ignored.
- Opening settings before the game loop exists: the menu poll is a no-op until `initGamepadSupport` runs from the `GameLoop` constructor.
- This environment cannot certify 75 presented FPS. The poll is one `getGamepads()` read per frame into preallocated buffers, with no per-frame `Set`, `Map`, or object allocation on the held-input path. Stick deadzones are read from a two-slot cache filled when bindings refresh. Vibration runs on a rising edge, a throttled health drop, or a menu click, not every frame. The deadzone preview writes a transform only while the mapping menu is open and only when its 20-step level changes. The cursor is one DOM node updated only when it moves. No canvas fill, gradient, or shadow was added. A qualifying-hardware 75 FPS check remains outstanding.

## Test plan

Unit tests cover `applyDeadzone` and `clampDeadzone`, per-stick deadzone resolution (player, then device, then 0.18) and reset, a default binding for every command, stick-mode pairs that share an axis without counting as a conflict, binding conflicts and capture edges, profile save/load/rename/delete/reset, player-profile slot assignment, the explicit-slot flag, controller-type detection, connect-time layout suggestion without replacing an explicit player profile, haptic on/off and a missing or rejected vibration actuator, the player → type → device → default resolution order, corrupt storage, slot reconcile (index change, identical ids, third pad), and the co-op camera hysteresis. `npm run test:unit` and eslint on the changed files are required.

Manual:

- Press a button so Chromium exposes the pad. Confirm the P1 lamp and the live meters.
- Bind an axis and a button, cancel with Escape, and confirm a conflict names the other command.
- Save, rename, load, delete, and reset a profile. Reload the page and confirm the library returns.
- Unplug and replug. Confirm the slot and profile stay.
- With two pads, remote-control two units. Pan until player 2 leaves the view and confirm the camera eases back to player 1, then eases to the midpoint when player 2 returns.
- In a hosted match, confirm the peer sees the remote-control motion.
