# 2026-09-30T12:03:00Z

**LLM:** Grok 4.7
**Harness:** Cursor Cloud Agent
**Tokens / duration:** exact input, visible output, and reasoning token counts are not available from this run. Wall clock from prompt receipt at 2026-09-30T12:03:00Z through the documentation commit was about 5 minutes. No game code, lint, or unit-test run: documentation only.

## Prompt

Update an open item in TODO/Features.md in https://github.com/theSystem85/code-for-battle. Do NOT change any game code.

## Task
1. Find the open item roughly titled "Add AI policy scripts" in `TODO/Features.md`.
2. Retarget it at the new programmable-units spec:
   - Spec lives at `docs/programmable-units-feature-list.md` on branch `feature/programmable-units` (read that file on that branch).
   - Either update the Features.md item so it clearly points at that programmable-units work / spec, OR if it fits better, merge/fold that open item into the spec's open questions and remove or replace the Features.md line accordingly — choose whichever is cleaner and less duplicative. Prefer a clear Features.md pointer to the spec unless the item is fully superseded by open questions already in the spec.
3. Make sure ALL wording you touch (and preferably all of TODO/Features.md if other German slips exist in that file) is in English. The codebase, namings, and filenames are English even though the owner speaks German.
4. Follow AGENTS.md. Note: the user EXPLICITLY asked to edit TODO/Features.md for this one item, so editing that shared file is required here despite the usual "don't append to Features.md" rule for feature work.
5. Always rebase onto latest main (never merge main into the branch). Open a draft PR.
6. If you need content from `feature/programmable-units`, read it from that branch; you may start from main and cherry-pick/read as needed, or start from feature/programmable-units if that makes the Features.md update land correctly. Prefer a small focused PR whose only change is the Features.md (and only related docs if merging open questions into the programmable-units feature list).

## Done when
- The "Add AI policy scripts" open item is retargeted or folded into the programmable-units spec as described.
- Wording in the changed Features.md content is English.
- No game/runtime code changed.
- Draft PR opened with a short description of what changed.

Report: exact before/after of the Features.md item (and any open-questions edits), PR URL.
