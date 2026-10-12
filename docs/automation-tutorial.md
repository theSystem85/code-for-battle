# Automation: your first Code for Battle program

Automation is why the game is called **Code for Battle**. You choose which normal game commands a state machine should issue. It can control supported units or defence buildings, build units, or build buildings. Money, technology, factories, construction space, visibility and weapon rules still apply.

## Create a unit automation in Buttons

Open Automation. In **Add automation to**, choose **control unit**. The other choices are **build unit**, **build base** and **control base defence**. Choose global scope to apply the program to all eligible owned units, or individual scope to bind selected units. Each entity progresses through its own state machine in either control scope. Continuous keeps evaluating; once stops after the first completed pass. Give the automation a useful display title: it is a label, not a variable.

States are numbered automatically from 1 to 7. Pick an initial state, an action for each state and rules that move between states. For a simple defensive machine, state 1 waits while health is healthy and moves to state 2 when relative health falls below 0.3. State 2 can seek service. Add a recovery condition to return to state 1. Save, enable and apply the automation to owned supported units. Inspect the state-machine view to see current progress.

Tank variants, rocket tanks, howitzers, Apache, F-35, ambulance, tanker, ammunition truck and recovery tank have control support. Production can build additional unit types; that does not make them controllable. Options depend on the category and capability of the selected entity.

## Switch to CFBL

Use the title-bar Buttons/CFBL toggle. Both views edit one accepted source. Changing a button also generates CFBL, even if you have never opened the text view. Switching views preserves your draft; saving persists it. The game remains paused while editing.

In CFBL, move the caret to a slot and search the flyout. Fuzzy search helps find a legal keyword or value without remembering its exact spelling. Select a result to commit a word. Your unfinished search is temporary input, separate from accepted code. Numbers use bounded entry rather than an infinite list of suggestions. Copy copies code; paste must validate as a complete legal edit. Invalid pasted text produces feedback and leaves accepted source intact. Undo restores accepted edits in either view.

CFBL has no variables, functions, arbitrary expressions or JavaScript. States use indexes rather than names. The [complete language reference](cfbl-language-reference.md) contains every keyword, parameter, bound and example.

## Branch, hold and delay

An IF/ELSE pair chooses a true or false branch of the same predicate:

```cfbl
control unit {
  scope individual;
  run continuous;
  start 1;
  state 1 {
    do wait;
    if (hp().relative < 0.3) goto 2;
    else goto 3;
  }
  state 2 { do wait; }
  state 3 { do wait; }
}
```

This deliberately simple example shows the branches without issuing combat orders. Replace the waiting actions using the legal action chooser. Rules are checked in order. An early IF/ELSE pair covers both outcomes and can preempt later rules; place narrower decisions first. ELSE is not a catch-all for the state and cannot attach to WHILE or AFTER.

WHILE temporarily enters its target while its condition is true, optionally ending at an UNTIL condition, and returns to its source when the hold ends. AFTER requires its condition to remain true for the simulation-time delay. A false condition or execution gate cancels the pending delay; editing time does not advance it. For full working action examples see [the reference examples](cfbl-language-reference.md#examples-and-explanations).

A self-transition is still a transition. Avoid unconditional cycles: continuous machines can repeatedly issue orders. Use conditions that represent a meaningful change rather than repeatedly requesting the same unavailable action.

## Automate production

For build-unit automation, choose unit type, quantity and delivery order. A replacement rule can use `ownUnitDestroyed(unitType=tank_v1)`; that event is visible during one eligible production evaluation pass. It is not a permanent flag and losses while evaluation is gated are not banked for later.

For build-building automation, choose a building and supported placement options. Keep building and unit production opt-ins separate: enabling one does not enable the other. Normal costs, technology, queue limits, factory availability, production time and legal placement apply. Check failure/retry status when an action cannot proceed. An automation does not instantly create an entity.

## Wait for an action to finish

For building and unit production, enable **Wait until produced** beside the action. The next state is considered only after the exact building finishes construction at its placement, or every unit in that stack spawns. Rally/delivery commands happen separately.

For finite unit actions, enable **Wait until done**. Movement waits for arrival; an attack waits for destruction of the target that action selected; service travel waits for its service objective. Both checkboxes have matching CFBL `wait until produced` / `wait until done` suffixes. Without a checkbox the existing behavior is unchanged. Persistent aim, rotation and protection commands do not have a finite completion option.

An interrupted/canceled action is not complete. Check the waiting/failed status and reapply the automation or edit its behavior to start fresh; manual orders retain priority.

## Control defence buildings

Create control defence-building automation, then apply it to owned supported defences. Pick only the options offered for that building: not every defence has the same ammunition, turret or target capabilities. Conditions can observe health, reload, visible enemies and supported range measurements. Effects use the same target and weapon rules as ordinary combat.

Inspect the bound building's active state and status. Manual target orders and hold-fire settings take priority; resolve the displayed conflict or allow manual control to finish before expecting automation to resume. A disappearing target must be reacquired through valid visible choices; the automation cannot bypass fog of war.

## Use a phone

On a phone the Automation dialog is full screen in portrait and landscape, with the view toggle and footer available. Scroll the editor, choose flyout entries and dismiss the keyboard before switching views if it covers a desired control. Tablets, including iPads in split screen, keep a bounded dialog. See the [release evidence](automation-release-evidence.md) for the distinction between emulated layout checks and real Safari keyboard verification.

## Troubleshooting

- **My partial word is missing after switching views:** a pending fuzzy query is not accepted source. Choose an option before switching.
- **Paste was rejected:** unknown words, duplicate parameters, unresolved state indexes, out-of-bounds numbers and invalid category choices are illegal. Start from generated source or a validated reference example.
- **A measurement is unavailable:** comparisons and checks return false when the entity cannot supply them. NOT inverts that false result, so `not` can make an unavailable leaf true. Choose a capability-supported measurement.
- **A machine will not act:** confirm save, enablement, binding, category opt-in, ownership and normal game requirements. Inspect direct-order conflicts and failure/retry status.
- **An imported automation needs repair:** preserve the original import, follow its validation report and save only after repairing unsupported data. Unknown future source versions must not be silently overwritten.
- **A state number changed:** insertion or removal regenerates contiguous indexes. References update with the edit; use undo to restore the earlier machine.
