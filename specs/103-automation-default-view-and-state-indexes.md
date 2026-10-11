# 103 — DAV, automatic state indexes, and the editor view toggle

Status: specified, not implemented. Read [099](099-automation-cfbl-program.md). Dependencies: [101](101-automation-source-sync-and-migration.md), [102](102-automation-if-else-runtime.md); vocabulary is [100](100-cfbl-language-and-coverage.md). Own the shared editor header/shell and DAV adapter. Coordinate ATV mount/unmount with 104 and sizing with 105.

## Required behavior

- User-facing title is **Automation** with the optional display title, never “Policy”. Update feature text in editor/panel/radial/conflict/status/template UI and accessibility labels. Keep concrete source/API identifiers until migration explicitly changes them. The documentation rename is already done; runtime copy is implementation work here.
- Title area contains a two-position toggle **Buttons / CFBL**, with accessible labels “Default automation view” and “Automation text view”. Expose selected state (`aria-pressed` or an appropriate tab pattern) and a visible focus indicator. The first open uses Buttons; remember the user's local preference thereafter as editor metadata, not behavior source.
- Toggling mounts the chosen view over the same draft controller, preserving source revision, current state selection, errors, unsaved edits and undo history. It does not call Save, change enabled state/opt-ins, start commands or release the existing editor pause. Dialog close restores prior pause/focus through the shell exactly once.
- DAV setup flow remains category first: **Control → Unit / Defence building**, **Build → Unit / Building**, then scope, execution, template and states. Creating a different category is an explicit reset with discard handling for changed drafts; do not silently drop incompatible actions/conditions. Existing categories stay fixed when editing a saved record, matching current behavior. ATV category replacement must obey the same restriction while editing an existing saved record.
- Automation display name remains an ordinary metadata field (60 characters); default titles are usable without typing. CFBL has no names. “State 1”, “State 2”, etc. appear in state headings, selectors, diagram nodes, rule targets, summaries and live viewers. Remove state-name text inputs.

## State editing invariants

Maintain array-order numbering and invisible stable state identities. Adding appends or inserts a state and regenerates contiguous indexes; max 7. Reordering renumbers labels and references without changing which underlying state each rule/start points to. Example: moving old state 3 before state 2 changes its visible index to 2, and every reference to old state 3 becomes `goto 2`.

Deleting a state with incoming references, an initial marker, or ELSE targets requires a reviewable operation that lists affected references and selects valid replacements or explicitly removes the dependent rules. Do not silently redirect to state 1. Cancelling keeps the whole machine unchanged. Once accepted, deletion plus reference repair is one undoable source transaction. The same operation is available through ATV flyouts. An unreferenced non-initial state may be deleted directly. Deleting the last state is disallowed; clear it to a wait-state skeleton instead.

Start selection can target any index. Generated new states use `do wait;` and no rules. Template insertion uses the existing full machine, mapped to indexes. Runtime/current-state display maps stable ID to index; do not display the old state name if source has changed. Rename-only changes never shift references.

## Conditions, effects and ELSE

Preserve every current effect, typed parameter, comparison mode, numeric range, nested logic, IF/WHILE/AFTER setting and delay. Use shared catalog metadata so the finite options match ATV. Author/display all schema-supported nested conditions through depth four; preserve an imported deeper-than-old-editor tree without flattening or losing it. Numeric controls stage out-of-range/unfinished entry; commit only a legal value. Flyout/field help explains fraction versus absolute units and unavailable entity capabilities.

Each IF has an optional **Add ELSE** control and an ELSE target selector. ELSE has no condition editor, no delay and no UNTIL. Deleting IF also deletes its alternative; removing ELSE leaves IF. WHILE/AFTER do not show Add ELSE. If a user changes an IF with ELSE to another kind, explain and explicitly discard the alternative as part of that operation, with undo available. Preserve rule priority order and make it editable in both views. Show a warning that an early IF/ELSE pair can preempt later rules.

State diagram and live state-machine view use indexes and show separate IF/ELSE branches sharing the predicate, WHILE UNTIL/return, and AFTER delay labels. No arbitrary state strings in SVG. Update `policyMachineView.js`, `policyMachineLayout.js`, summary/status helpers and template names/copy as necessary. A new defence section/options are exposed only when spec 106 is integrated, though the category can be represented in the shared model earlier.

## Suggested code surfaces and acceptance

Primary surfaces: `policyEditorModal.js`, `conditionRows.js`, `policyPanel.js`, `policyMachineView.js`, `policyMachineLayout.js`, `policyConflictBanner.js`, `unitPolicyRadial.js`, `policyTemplates.js`, `policyTooltip.js`. Scope UI copy searches to feature surfaces; do not rename unrelated browser policy options. Header API should accept a shared controller and two view adapters so 104 does not fork the whole dialog.

Behavior tests create a template in DAV, edit every setting and switch to ATV, verifying canonical source and identical machine. Add/reorder/delete/start-state changes cover IF/ELSE references and undo. State-name fields are absent; indexes appear across editor/live/status UI. Existing templates work without asking for state names. ELSE has legal targets only. Save/Cancel/pause, metadata naming and existing production opt-ins remain functional.

Verification: updated editor/condition/machine/panel tests and all unit tests, lint; release-level browser flow in 108 drives Buttons → CFBL → Buttons including cancel and save. Handoff: shared header/view-adapter API, source operation helpers, accessible toggle labels and stable DOM roles/selectors for ATV/mobile tests.
