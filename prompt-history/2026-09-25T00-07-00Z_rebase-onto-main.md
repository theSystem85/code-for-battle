# 2026-09-25T00:07:00Z

Grok 4.7, Cursor cloud agent. Token counts and reasoning-token totals were not exposed by this harness, so they are omitted. The rebase, conflict resolution, unit tests, and this note finished at 2026-09-25T00:11:00Z (about 4 minutes from the prompt).

## Prompt

Patrick approved a rebase with force-push. Do this on `cursor/heavy-battle-frame-time-e373` (PR #703):

1. Make sure no merge commit from main is on the branch. If one was pushed, drop it during the rebase.
2. `git fetch origin` and rebase the branch onto the latest `origin/main` (`git rebase origin/main`). The branch must end up with a linear history on top of main, with no merge commits at all (also none from the earlier merge of the #702 branch; replay those commits linearly). It must still contain all of #702's changes, including the atlas `RENDER_ATTACHMENT` fix. Resolve conflicts commit by commit, keeping both main's changes and ours. For the TODO backlog markdown files, keep all entries, and if main restructured them, put our entries in main's format under the right section.
3. Add a clear rule to `AGENTS.md` (in a sensible place, e.g. a Git/Workflow section): never merge main into a feature branch and never create merge commits; always rebase onto main (`git fetch && git rebase origin/main`) and push with `git push --force-with-lease`; PRs are merged without merge commits (squash or rebase). Keep it short and unambiguous. Put it in its own commit.
4. `npm ci` if the lockfile changed, then `npm run lint:fix:changed` and `npm run test:unit`. Fix any breakage.
5. `git push --force-with-lease origin cursor/heavy-battle-frame-time-e373`. Verify with `git log --merges origin/main..HEAD` (should be empty) and check that GitHub reports #703 as mergeable with no conflicts.
6. Update the #703 PR body: it supersedes #702 (includes all of its changes; #702 doesn't need merging), and it adds the rebase-only rule to AGENTS.md. Don't close #702, don't merge anything.
