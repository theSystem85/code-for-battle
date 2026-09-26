# Spec 093: Radial build menu

## Summary

Holding a pointer on one of the player's own production buildings opens a reusable circular menu of that building's current sidebar build options. Releasing on a button issues the same production command the sidebar increase action uses. Unit production is bound to the building that opened the menu.

## Reusable radial menu API

Module: `src/ui/radialMenu/`.

```js
import { createRadialMenu, createLongPressTracker, layoutRadialItems, hitTestRadial, resolveRadialTiming } from './ui/radialMenu/index.js'

const menu = createRadialMenu({ container }) // container defaults to document.body

menu.open(anchor, items, options)
menu.updatePointer(clientX, clientY) // returns the item under the point, including disabled items
menu.setHoldProgress(id, progress) // 0..1 ring on one button; id null or progress 0 clears it
menu.release(clientX, clientY) // calls item.onSelect when the item is enabled, then closes
menu.close()
menu.isOpen()
menu.destroy()
```

`anchor` is a screen point `{ x, y }` in client pixels.

`items` is an array of:

- `id` string
- `icon` image URL
- `label` string
- `disabled` boolean
- `ready` optional boolean, drawn with the sidebar ready-for-placement ring
- `onSelect(item)` optional callback used by `release`

`options`:

- `radius` preferred inner-ring radius in pixels
- `buttonSize` button diameter in pixels
- `gap` minimum space between buttons
- `stagger` requested delay between buttons in milliseconds
- `duration` requested fly duration for one button in milliseconds
- `budgetMs` total build time, default `1000`
- `padding` viewport inset
- `minButtonSize` floor used when the circle must shrink to stay on screen
- `maxPerRing` default `8`
- `viewport` `{ x, y, width, height }` in the same coordinate space as `anchor`

Behavior that does not depend on production:

- Buttons are positioned with CSS `transform` and `opacity` only. The closed menu is `display: none` and runs no animation frame.
- Each button starts at the anchor and flies to its ring slot with `ease-in-out`, staggered in order. `resolveRadialTiming` clamps fly plus stagger so the last button finishes within `budgetMs`.
- `layoutRadialItems` uses one or more rings so neighboring buttons do not overlap. If the circle would leave the viewport, the center shifts and, when needed, the button size shrinks down to `minButtonSize`.
- `hitTestRadial` returns the nearest button whose center is within half the button size, or `null`.
- `createLongPressTracker` is the pointer gesture state machine: hold `500` ms (`holdMs`), cancel if the pointer moves more than `12` px (`moveCancelPx`) before the hold completes. `poll(time)` returns `fire` once. `pointerUp` returns `short`, `release`, or `cancelled`.
- `setHoldProgress(id, progress)` paints a CSS conic-gradient ring on that button. It changes one custom property and a class. It does not run while the menu is closed.

The production adapter is the first caller. The same `open` API can later host unit command menus by passing different items.

## Production adapter

Module: `src/ui/productionRadial/`.

Installed from `setupInputHandlers` on the game canvas. It does not run in the simulation tick.

Buildings that open the menu, and only when they belong to the human player and still have health:

- `constructionYard` — every building button currently shown in the sidebar
- `vehicleFactory` — ground units produced there
- `helipad` — Apache and F35
- `airstrip` — F22 Raptor and F35
- `shipyard` — naval units

An option is included only when its sidebar button is visible the way the sidebar shows it: `unlocked`, `active`, `paused`, or `ready-for-placement`, and not `display: none`. A `disabled` sidebar button stays in the menu at 50% opacity, matching `.production-button.disabled`. There is no stack-count zone. A successful release adds one item.

Button diameter is half the condensed sidebar button (`--portrait-condensed-bar-height`, 96px, so 48px) unless the viewport fit has to shrink it.

Selection uses the sidebar command path. The production command module loads on the first gesture, so installing the menu does not pull the audio and video overlay into input setup:

- A building option enters planning mode instead of queueing immediately. The placement ghost follows the pointer, with the same valid and invalid tile colors as sidebar planning.
- Releasing on a building, then pressing the map, drags that ghost. Releasing on a valid tile places it. A tap with no drag places on that tile too. An invalid tile does not place and leaves planning mode active.
- Resting on a building button for 500ms, while the menu is still held, closes the menu and attaches the ghost to the pointer. The button shows a progress ring during that hover. Leaving the button before 500ms resets the timer. The release places the blueprint the same way. An invalid release keeps planning mode so the player can drag again.
- Releasing that drag over the sidebar or other UI, or pressing `B`, `Escape`, or the right button, cancels planning. The map does not box-select or scroll-drag during the blueprint drag. Desktop edge scroll still follows the pointer while the ghost is dragged.
- A building that is already ready for placement uses `productionQueue.enableBuildingPlacementMode` and the existing click-to-place path. Any other building places a blueprint with `productionQueue.addItem(type, button, true, blueprint)`, the same command the sidebar drag uses, so construction starts at that tile and stays in lockstep.
- Units call `productionQueue.addItem(type, button, false, null, null, { factoryId })`. Hovering a unit does not arm a timer.
- Disabled options show the same failure notification as the sidebar and do not queue.
- Paused games do not queue or enter planning.

`factoryId` is stored on the queue item, copied onto the active production, serialized with the queue, and recorded on the `production_add` replay command. When the unit completes, spawn uses that factory when it still exists and can accept the unit. A missing factory falls back to the existing round-robin. A full explicit airstrip or pad waits instead of spawning from a different building. Sidebar clicks omit `factoryId` and keep round-robin.

## Pointer, touch, and gamepad

- Mouse, pen, and touch use pointer capture. Touch also calls `preventDefault` on `touchstart` over a production building so iOS Safari does not open the callout, magnifier, text selection, or page scroll. `contextmenu` is swallowed for the gesture.
- The original pointer down is stopped. A release before 500ms, or a move beyond 12px before 500ms, replays a normal click or drag so short taps, box-select, and map drags stay unchanged. A completed long-press does not also select or order a move.
- Release anywhere closes the menu. Release outside a button, or on a disabled button, does not build.
- Gamepad player 1 already sends mouse down, move, and up from the A button and the cursor stick. Holding A on a production building opens the menu, the stick moves the highlight, and releasing A builds. Map edge scroll is suppressed while the menu is open so the circle stays put.

## Performance

Closed: the root is `display: none` with no children and no requestAnimationFrame. Open animation is two setup frames plus CSS transitions. No per-tick work is added to the unit or render loops. The only per-frame checks are a boolean skip for desktop and gamepad edge scroll while the menu is open.

## Test plan

- Long-press fires at 500ms, ignores sub-threshold jitter, and cancels past 12px.
- Timing for a large item count stays within 1000ms.
- Hit testing picks the button under the point and misses the center.
- A 20-item menu on a 390×844 viewport stays inside the padding and does not overlap.
- Construction yard, vehicle factory, helipad, airstrip, and shipyard item lists follow sidebar visibility and disabled state.
- `selectProductionRadialItem` queues a unit with the chosen `factoryId` and enables placement for a ready building.
- A building-button hold fires at 500ms, resets when the pointer leaves, and never fires for a unit.
- A valid blueprint drag calls `addItem` with the tile blueprint. An invalid tile keeps planning mode. A release over UI cancels. Unit release still queues on the chosen factory.
- `completeCurrentUnitProduction` spawns from that factory and does not advance the round-robin index.
