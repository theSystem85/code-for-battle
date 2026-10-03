# 2026-10-03T22:45:00Z

**LLM:** Cursor Cloud Agent using Claude Sonnet 5.5
**Harness:** Cursor Cloud Agent
**Tokens / duration:** exact input, visible output, reasoning token counts and duration are not available from this run.

## Prompt

Implement the first slice of programmable unit policies in theSystem85/code-for-battle. You are the orchestrator for the critical path: own the policy document, the pure state-machine step, and how a direct order interacts with a policy. Also update the specs. A separate pass may add less critical UI on this same branch later, so push the branch early and keep the policy JSON stable. Open a draft pull request. Do not merge it.

Fixed decisions:

- A direct order always wins when given. Active policies pause until that order is completed and the unit would otherwise become idle.
- `if <cond>` fires once when the condition becomes true and does not keep overriding later direct orders (example: retreat if HP < 25% fires once).
- `while <cond>` stays in effect until an end condition. A while-condition that becomes true after a direct order overrides that order. Example: HP 100%, retreat-while-below-25% active, the user orders attack, HP drops below 25%, the unit retreats; if the user orders attack again, the new order wins ("last command or last newly triggered condition is dominant").
- When a while-policy is currently overriding and the user gives another direct order, show a conflict message and let the user pause that policy until the new order is fulfilled.
- Several policies may be active; the last command or last newly active condition wins.
- Only the commanding owner (human player, or an AI commanding its own units) can enable or disable a policy.
- Units only. Buildings and base-expansion policies are out of this slice.
- Spec only: when the enemy AI is LLM-driven, that LLM can also write and apply unit policies. Say this is later work.
- An invalid policy draft shows a red exclamation icon at the top right, a slight red background, and a message with the reason (for example "more than 7 states").

Still in force: visual block builder with no source code; a policy is a state machine of at most 7 states; global policies are always active once enabled; per-unit policies are applied mid-battle from a radial context menu (right-click or long-press); one-time starts immediately on apply and conditions still gate effects; the editor is a modal that pauses the simulation; explicit grants and folders are recorded in the spec but not built; do not migrate the existing AI modules and do not edit `src/enemy.js`; direct orders stay on the existing command path.

Update `docs/programmable-units-feature-list.md` and `docs/programmable-units-orchestration.md` (they exist only on `origin/feature/programmable-units`, so bring the current decisions into those docs on this branch). English only.

Repo rules: rebase onto main, no merge commits; new prompt-history files in English; per-issue notes in their own markdown file; custom scrollbars only, no nested scrollers, no browser default title tooltip next to a custom tooltip; visually verify any UI.
