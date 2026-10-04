# 2026-09-30T12:13:00Z

**LLM:** Cursor Cloud Agent using Grok 4.7
**Harness:** Cursor Cloud Agent
**Tokens / duration:** exact input, visible output, and reasoning token counts are not available from this run. This prompt was folded into the same documentation commit as the surrounding design-decision prompts. No game code, lint, or unit-test run: documentation only.

## Prompt

Additional design decision to fold into BOTH docs on this branch (docs/programmable-units-feature-list.md and docs/programmable-units-orchestration.md). English only. Do not change game code.

Build policies are a SECOND POLICY VARIANT alongside unit policies:
- Unit policies target units.
- Build policies target buildings and base building / base expansion.
- A player can apply build policies to their own base to automate its construction.
- In multiplayer, each player chooses individually whether to use build policies for their own base expansion (per-player opt-in, not host-global).
- The enemy AI can also be given build policies (e.g. how its base building works), same as any other policy — subject to the existing explicit grant/sharing model (folder structure with parent-to-subfolder permission inheritance).

Update the feature-list so this variant is a clear product requirement (targets, own-base automation, MP per-player choice, AI grant).
Update the orchestration plan so parallelization/interfaces account for two policy variants (unit vs build), and note any workstream impact (schema discriminant, apply targets, activation, sharing).

Also keep incorporating any earlier design decisions still in flight for these docs (explicit share/grant with folder inheritance; policy editor as modal that pauses the game; global vs per-unit; one-time vs continuous with one-time per-unit firing immediately on apply while internal conditions still gate effects; radial apply menu).

When done, report a short diff summary of what changed in EACH of the two files.
