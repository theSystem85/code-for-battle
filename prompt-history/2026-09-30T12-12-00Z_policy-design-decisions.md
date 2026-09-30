# 2026-09-30T12:12:00Z

**LLM:** Cursor Cloud Agent using Grok 4.7
**Harness:** Cursor Cloud Agent
**Tokens / duration:** exact input, visible output, and reasoning token counts are not available from this run. This prompt was folded into the same documentation commit as the two follow-ups below. No game code, lint, or unit-test run: documentation only.

## Prompt

Update two documents on branch `feature/programmable-units` with newly decided design decisions. ALL text English. Do NOT change game/runtime code.

## 1) `docs/programmable-units-feature-list.md` (the spec)
Add these decisions clearly into the appropriate sections (new subsections if needed):
- Players can **share/grant** policies to themselves, other multiplayer players, or AIs as an **explicit act** (not automatic), via a **folder structure** for policy management where **subfolders inherit permissions from their parent**.
- The **policy editor is a modal that pauses the game**.
- Distinguish **global always-active policies** vs **per-unit policies applied mid-battle**.
- Distinguish **one-time** vs **continuous** execution for policies.
- **One-time per-unit policies fire immediately on application**; any internal conditions in the policy (e.g. engage only when enemy in range) still gate what actually happens.
- A **radial context menu** (similar to the existing factory build menu), opened via **right-click or long-press** on a unit in combat, listing available policies to **dynamically apply** to that unit.

## 2) `docs/programmable-units-orchestration.md`
If it exists (it should from the earlier job on this branch / PR #725), update it with the **same decisions** plus how they affect **parallelization and interfaces** between workstreams. If it somehow does not exist, create it with the prior orchestration content plus these decisions.

Follow AGENTS.md (change notes in a new per-issue file under docs/changes/). Rebase as needed; never merge commits. Update the draft PR (likely #725) or open one if needed.

## Done when
Both docs reflect the decisions; no game code changed; PR updated. Report exactly what changed in each file (section names + short summary).
