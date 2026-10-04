# 2026-09-25T08:38:14Z

**LLM:** Cursor Cloud Agent using Grok 4.7
**Harness:** Cursor Cloud Agent
**Tokens / duration:** exact input, visible output, and reasoning token counts are not available from this run. Wall clock from prompt receipt at 2026-09-25T08:37Z through the documentation commit was about 3 minutes. No code, lint, or unit-test run: documentation only.

## Prompt

Documentation-only task. Do NOT implement any code.

Create a Markdown feature list in German describing the planned "programmable units" feature. Location: a docs folder at the repo root. If a docs folder already exists (any casing, e.g. `docs/` or `Docs/`), use that existing folder; otherwise create `Docs/`. File name: `programmable-units-feature-list.md`.

Content must capture these design decisions (write in German, clear headings and bullet points, concise but complete enough to serve as a starting spec; include short sections such as Ziel/Überblick, Kernkonzepte, Builder, Policies, Vereinheitlichung der Gegner-KI, Visualisierung/UI, and a brief 'Offene Fragen' list if useful, clearly marked as open):

1. Units become programmable by the player.
2. Players define behavior through a visual drag-and-drop builder, no coding required, block-based construction principle.
3. The builder supports both conditional triggers that fire actions (e.g. "wenn Gegner in Reichweite, dann angreifen") AND persistent state-based rules (e.g. "verteidigen, solange HP unter 50 %").
4. These player-created scripts are called "Policies". Players can activate/deactivate policies at runtime (toggle on/off during gameplay, switch strategies mid-battle).
5. All existing AI behaviors controlling the enemy AI must be unified onto the same script system, so there is one consistent behavior engine for player policies and enemy AI; only the entry point differs. You may briefly reference where the current enemy AI lives in the codebase (read-only look) so the spec is grounded, but do not change it.
6. Visualization: the drag-and-drop builder and resulting policies should be nicely visualized in the UI.

Also follow repo conventions in AGENTS.md (e.g. if it requires a TODO/Features.md entry with a spec link, add one pointing to the new doc). Git rule: branch off latest main, no merge commits ever; if you need to update, rebase onto origin/main and push with --force-with-lease. Open a draft PR with a short description. Report the PR URL and the file path.

## Follow-up

Updated instructions from the user: create the branch named exactly `feature/programmable-units` off the latest origin/main (not a cursor/* branch) and commit the doc there (one or a few commits). Folder: use `Docs/` (create it if no docs folder exists; if an existing lowercase `docs/` exists, use that and mention it). File: `programmable-units-feature-list.md`. Content requirements unchanged (German, documentation only). Do NOT open a pull request. Keep pushes to the minimum needed for the branch to exist on the remote; no merge commits. Report the branch name, file path, and commit hashes.
