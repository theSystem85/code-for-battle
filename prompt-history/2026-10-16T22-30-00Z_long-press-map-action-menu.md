UTC timestamp: 2026-10-16T22:30:00Z (requested entry timestamp)
Harness: Codex
Model designation available in this session: GPT-6. Exact deployed model version and reasoning level are not exposed. Input, visible-output and reasoning-token accounting and exact task duration are not available and are omitted.

# User request

You are working in a git repository checked out at the current directory (branch codex/code-for-battle-new-feature-off-20261017-002752-07820a, based on main).
Follow the repository's own instructions (AGENTS.md etc.) for code style, docs and tests, but do not commit, push, or change git remotes; the operator commits for you.
Stay inside this directory. Network access is disabled in the sandbox. Do not add secrets or credentials.
TASK:
code-for-battle, new feature off main: long-press map action radial menu. Version bump to 0.57.0 (package.json and wherever the app version lives, e.g. src/version.json; add features/0.57.0.json following the existing features/*.json format).

Behaviour:
- Long press (mouse button held or touch held) on the map for a configurable duration (default 1500 ms, new setting in the existing settings UI, persisted like other settings, range e.g. 300-5000 ms) while own units and/or own defence buildings are selected opens a radial/circle action menu centred at that location. REUSE the existing radial menu component and style: src/ui/radialMenu/radialMenu.js (see how src/ui/policies/unitPolicyRadial.js and src/ui/productionRadial/* use it). Do not create a new menu style.
- Cancel the long press if the pointer moves beyond a small threshold (e.g. 8 px mouse / 12 px touch), on pointerup before the timeout, on multi-touch (pinch/two-finger pan), on drag-selection start, or camera pan. Must not conflict with existing click, right-click, drag-select, minimap, building placement, map edit mode, or touch camera pan/pinch; after a long press opens the menu, the release must NOT also issue the normal click/move command. Show subtle progress feedback (e.g. a ring filling at the press point using existing styling) only after a short delay (~200 ms).
- Options for selected units:
  1) Force attack there (attack-ground / force-fire at that location, using the existing force-attack command path).
  2) Defend & hold position there: move to the location, then hold position; auto-engage enemy units in range but do not chase beyond a leash (reuse existing guard/hold logic if present, otherwise add a minimal hold state honoured by unit AI).
  3) Apply unit control automation on arrival: submenu listing all available unit control automations/policies (see src/ui/policies/*, the policy registry) that are applicable to the selected unit types; choosing one moves the units there and applies that policy when each unit arrives.
- For selected defence buildings: only meaningful options (force attack / target area at that location, hold fire/hold or clear target if applicable). Mixed selection: show options valid for at least one, apply per entity type.
- Multiplayer: issue through the existing command/network sync path, like other unit commands.
- Agent API: every UI action must have a matching agent API call in the existing agent/automation API used by the game (find where existing commands are exposed, e.g. window.__CFB__/agent API modules; rg "agentApi|AgentApi|__AGENT"). Add: openMapActionMenu({x,y}) (tile or world coords per existing conventions), forceAttackAt, defendHoldAt, applyAutomationOnArrival({policyId,x,y}), listApplicableAutomations(), setLongPressDuration(ms).
Tests: unit tests (long-press controller timing/cancel thresholds/no click after open, option filtering for units vs defence buildings, applicable automations filtering, command dispatch). e2e tests/e2e/longPressMapActionMenu.test.js: desktop mouse long press opens menu, short click does not, movement cancels; each option dispatches the expected effect (force attack target set, hold state + move target, policy applied on arrival); mobile emulation (hasTouch, isMobile viewport) touch long press opens menu and pinch does not; setting change affects duration; agent API calls work.
Docs: docs/changes/2026-10-17-long-press-map-action-menu.md, prompt-history/2026-10-16T22-30-00Z_long-press-map-action-menu.md, TODO/Features.md entry if that file is used for this. English, no HTML title attributes, no top-level await. Run lint + unit tests.
