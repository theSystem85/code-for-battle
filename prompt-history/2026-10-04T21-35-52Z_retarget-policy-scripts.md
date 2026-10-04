# 2026-10-04T21:35:52Z

**LLM:** Grok Bot
**Harness:** Grok Bot
**Tokens / duration:** exact input, visible output, and reasoning token counts are not available from this run. Wall clock was not recorded as a measured duration.

## Prompt

Update two open draft docs pull requests on https://github.com/theSystem85/code-for-battle so they only augment current main, then merge them. Do not use Cursor cloud agents. Work on this box. A checkout may exist at /workspace/code-for-battle but it is behind main; fetch origin first. gh is not logged in. Use the GitHub API via curl for reads, and the user-GitHub-xai MCP tools (create_branch, create_or_update_file, get_file_contents, create_pull_request) or cursor-github merge_pull_request to write and merge. Do not force-push over unrelated work. Do not use merge commits. Prefer rebase or fast-forward. Use squash only if a merge commit would otherwise be required. Prefer updating the existing PR branches and merging with merge method rebase if the history is linear. Otherwise put a single clean commit on a new branch from current main and rebase-merge it. Current main tip was 47921421 (includes merged #727 and #728).

Source of truth: current main. #727 AGENTS.md rule 19 (prompt-history always English) must stay. #728 programmable-units implementation and the docs already on main win over these drafts.

PR #725 is dirty and would roll the spec back. Do not take its versions of docs/programmable-units-feature-list.md or docs/programmable-units-orchestration.md. Those files on main are newer. Rewrite the PR so any unique notes that are still true and not already on main are added without contradicting main. If the PR has nothing left that is not already on main or that would contradict main, close it with a short comment explaining it was superseded by #728, instead of merging a no-op or a rollback. If there is real additive content, put it on a branch from current main, open or update the PR, and merge with rebase (no merge commit, no squash unless that is the only way).

PR #724 is git-clean but factually wrong. Fix before merging:

- Do not say the spec lives only on branch feature/programmable-units. It is on main.
- Do not say a drag-and-drop builder replaced JSON. Policies are still JSON (schema v1).
- Do not say one behavior engine already runs enemy combat. Unit policies and base/build policies exist. Enemy combat (src/enemy.js, src/ai) is not on that engine yet. Phrase that as later work.
- Keep wording aligned with main: if, while, and after; only the commanding owner can enable/disable/apply; the health condition label is exactly "HP".
- The open sub-item about weak units retreating then counterattacking can stay as not-yet-done if it is not already shipped. Shipped templates include retreat-if-hurt, retreat-while-hurt, and attack-while-in-range.
- Prompt history and change notes in English. Do not rewrite older prompt-history files. Do not append to shared TODO/Bugs.md, Improvements.md, or Features.md except the intended Features.md retarget if that edit is still the point of #724 and is corrected.

After the corrected #724 (and #725 only if it still has additive truth) is on a branch from current main, merge it with GitHub merge method rebase. Verify the merge commit is not a merge commit (one parent) and main moved. Report PR urls, what changed, what was closed, and the new main sha.

If a write tool needs a blob SHA, get_file_contents first. Never disable CI. Do not touch the unfinished fix/smoke-lint branch except to avoid colliding with it.
