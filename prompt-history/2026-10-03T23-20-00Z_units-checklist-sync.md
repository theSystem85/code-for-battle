# 2026-10-03T23:20:00Z

**LLM:** Cursor Cloud Agent using Claude Sonnet 5.5
**Harness:** Cursor Cloud Agent
**Tokens / duration:** exact input, visible output, reasoning token counts and duration are not available from this run. Documentation only; no game code was changed.

## Prompt

After the toggle-clip fix, update the programmable-units checklist in the repo so it matches what is actually built. Do not change game behavior in this follow-up.

Write a remaining-work checklist into docs/programmable-units-feature-list.md and keep specs/unit-policies-first-slice.md in agreement. Mark done what the first slice already has. Mark the policy-card toggle clipping as a known UI bug being fixed on this branch. Add a note, in the radial-menu section, that the menu lists only per-unit policies, stays closed when the player has none, opens on a desktop right-click or a still half-second touch on the unit center, and that the shipped "Attack while an enemy is in range" template is global so it never appears there.

Leave buildings, grants and folders, enemy AI migration, and LLM-written policies as later work. Do not merge. Prompt-history entry in English. Per-issue notes stay in this change's own markdown file, not the shared TODO files.
