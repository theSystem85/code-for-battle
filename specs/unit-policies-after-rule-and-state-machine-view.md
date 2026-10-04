# Unit policies: the `after` rule, the live state-machine view and automation status

Follow-up to [Unit policies — conditions, command API and activity display](unit-policies-conditions-and-command-api.md). Units only; buildings and enemy AI are untouched.

## 1. The `after` rule kind

A rule is `if`, `while` or `after`. `if` and `while` are unchanged.

| Kind | Meaning |
| --- | --- |
| `if` | Fires once, on the step its condition becomes true. |
| `while` | Fires the same way, then the target state is held until the end condition. |
| `after` | When its condition becomes true a delay starts. If the condition is still true when the delay is over the rule fires once, like `if`. |

Example: do nothing, and after 10 seconds move 2 tiles forward (template "Move 2 tiles forward after 10 seconds").

- **Schema.** `kind: 'after'` needs `delaySeconds`, a whole number from 1 to 3600 (error code `invalid_delay` otherwise). `delaySeconds` on an `if` or `while` rule is invalid. `until` stays `while` only.
- **Editor.** The rule-kind select has a third option, "AFTER (waits, then fires once)". An after rule shows two number inputs, minutes and seconds ("wait 1 min 30 sec after the condition becomes true"). The two inputs are stored as one `delaySeconds`; seconds carry into minutes; a total of 0 is shown as an invalid draft (save disabled). The diagram colors after-rules purple (`#c792ea`); `if` blue, `while` amber.
- **Engine.** `runtime.pending` maps rule id to the simulation time (ms) the delay is over. It is armed when the condition becomes true, cancelled when the condition goes false first (the delay then starts over next time), and dropped whenever the gate is not open (a direct order is running, or the policy is paused). The clock is `worldView.now`, the simulation time, so game speed and pause apply. A direct order therefore cancels a running delay.
- **In control.** A running delay counts as "in control" even though the machine still sits in its start state: the policy is already acting on the unit. This is the one exception to the "not in the start state" rule. Once the rule fired, the normal rules apply (not in start state, not finished; for `after` the target state is not held, so a one-time policy ends there).
- **Trace events.** `delayStarted`, `delayElapsed`.

## 2. State entry counts

`runtime.entered` maps state id to how often the machine entered it. The start state begins at 1. Every transition into a state increments it, including the return from a `while` hold.

## 3. Live state-machine view

Opened and closed with the **State machine** button in the unit's radial menu (`src/ui/policies/policyMachineView.js`, layout in `policyMachineLayout.js`). One section per policy on the unit.

- **Edges** show the full trigger inside the rule kind: `if(ammo == 100%)`, `while(HP < 25%) until(HP > 50%)`, `after 1m 30s if(…)`. Text longer than 30 characters wraps onto the next line; the layout reserves vertical room for every wrapped label so states never overlap.
- **Layout.** States are stacked in a column. Every rule leaves the right side of its source state, runs under its label, travels down a lane of its own and re-enters the target state from the right. Labels sit left of all lanes, so no line crosses a label. The SVG scales to the panel width; the panel has exactly one scroller (the global custom scrollbar).
- **Live.** The current state is highlighted (amber outline; held states also carry `is-holding`). Each state shows "entered N×". A running `after` delay shows the remaining time ("7s left"). Updated in place four times a second (`MACHINE_REFRESH_MS`); the diagram is rebuilt only when the unit's policies change.
- **Radial menu opening rule (relaxed).** The menu used to stay closed without per-unit policies. It now also opens when the unit carries any policy (for example a global one) so its state machine can be inspected.

## 4. Automation status and the in-control indicator

- **Unit detail panel** (the panel opened by a long-press on a unit in the build menu: summary, UNITS, WRECKS). Every live unit row ends with an automation chip: `⚡ <policy name>` (or `⚡ N policies`) while a policy controls it, `🤖 N waiting` when policies are enabled but not in control, `🤖 manual` otherwise. Wreck rows show `🤖 inactive`. The chips are refreshed in place twice a second while the panel is open. No native `title`.
- **Replaces** the Units-tab long-press popover from the previous follow-up, which was a misreading of "the detailed unit list opened by a long-press on the Build button". The popover and its tests are removed.
- **Indicator rule.** The bolt badge shows on every living unit of the local player that has any active policy, whether the policy is global or was applied from the radial menu to that one unit. The owner comparison treats the legacy owner `player` as `player1` (`shouldShowPolicyIndicator`).
- **Applying by hand.** Applying or removing a policy from the radial menu recomputes the unit's activity flags immediately (`refreshUnitPolicyActivity`) instead of waiting for the next evaluation, which is skipped for units without bindings. This also clears a stale badge when the last policy is removed.

## 5. Naming

The health condition is labeled **HP** everywhere in the policy UI and docs (never "hit points" or "health points"). The schema field stays `hp` and measures the unit's `health / maxHealth`.

## 6. Radial menu label size

The policy text buttons use a 9 px label (was 11 px) so long policy names fit the 64 px button.

## Known gaps

- The reported "in control count misses a policy applied to one unit" could not be reproduced end to end. Every scripted flow (engine, panel and a real browser run through the radial menu) counted the unit correctly. The per-unit path was hardened (immediate activity refresh, owner normalization) and regression tests drive `buildUnitPolicyItems → onSelect → engine → panel`. If it still happens, a repro with the policy kind and execution mode is needed. Note that a per-unit one-time `if` policy finishes and removes itself, so it is by design not "in control" afterwards.
- A per-unit `if` rule is never "held", so it only counts as in control while an `after` delay is pending.
- The machine view shows the edge colour per kind but has no export or trace history.
- Performance: the view and the automation chips are throttled UI (4 Hz and 2 Hz) and add no per-frame work. The engine adds one number write per evaluated unit. No 75 FPS benchmark on qualifying hardware was run; that check stays outstanding.

Tests: `tests/unit/policyAfterRule.test.js`, `tests/unit/policyMachineView.test.js`, `tests/unit/policyRadialControl.test.js`, `tests/unit/productionTooltipAutomation.test.js`, `tests/unit/offlineMode.test.js` (status row).
