# 2026-10-04T14:20:00Z

**LLM:** Cursor Cloud Agent using Claude Sonnet 5.5
**Harness:** Cursor Cloud Agent
**Tokens / duration:** exact input, visible output, reasoning token counts and duration are not available from this run.

## Prompt

Seven follow-ups on this same branch for draft PR #728. Do not merge. Prompt-history in English. Per-issue notes in this change's own markdown file. Visually verify UI changes and attach screenshots. Custom tooltips only, no native title. Custom scrollbars, no nested scrollers. The attached screenshot is the unit detail panel (Tank V1): summary counts, then a UNITS section with one live tank (status, HP, fuel, ammo, crew, rank, money) and a WRECKS section. Item 7 adds automation status on each live unit row in this panel.

1. Move the music toggle out of the left sidebar into the same row as the online/offline toggle. Music toggle at the very left of that row, online/offline toggle at the very right.
2. Make the font size of the policy button labels in the circular menu around a unit smaller so the labels fit.
3. In a unit's circle menu, add a button that toggles a visualisation of that unit's policy state machine.
4. In that state-machine view, each edge shows the full condition inside the if, for example "if(ammo == 100%)". When an edge label is too long, wrap it onto the next line. Highlight the current state node. Also show how often each node has already been entered.
5. Bug: when a policy is applied manually to one unit from the circle menu, the policy panel's "in control" count does not include that unit even while the policy is controlling it. Global policies already update "in control" correctly. "Enabled" is already correct in both cases. Fix the per-unit path so "in control" counts a unit a per-unit policy is actively controlling. Actively controlled still means a condition has fired and the machine is not in its start state and not in an end state, but inside a while (or the new after delay, once that is running).
6. Add a third rule kind besides "if" and "while": "after". The player enters a delay in seconds and minutes. The rule waits that long after its condition becomes true, then runs. Example: do nothing, and after 10 seconds move 2 tiles forward. Wire it into the schema, editor, validation, engine, and tests. Keep the existing if/while and direct-order rules.
7. The flash/bolt indicator that a policy is in control of a unit must also show when that policy was applied from the circle menu to that one unit. Every automation that is in control shows the indicator. Also show each unit's automation status on its row in the build/unit detail panel from the screenshot (the panel opened for a unit type, with UNITS and WRECKS).
