2026-09-24T23:54:13Z

Grok 4.7, Cursor Cloud Agent. Token counts were not available for this run, so they are omitted.

# Prompt

Create a new branch from main and open a draft PR that beautifies and cleans up the three backlog files: Bugs.md, Improvements.md and Features.md (they live under `TODO/`; find them with a search if the path differs). Documentation only, no code changes.

Goals:
1. **Clear separation between the files.** Define the rule at the top of each file in one or two sentences:
   - Bugs.md: something that is broken or behaves contrary to intended/spec'd behavior.
   - Improvements.md: changes to existing features (polish, performance, UX, refactors, balancing) where nothing is broken.
   - Features.md: new capabilities that don't exist yet.
   Move every entry that sits in the wrong file to the right one.
2. **No redundancy.** Find duplicate or overlapping entries within and across the three files and merge them into one entry, keeping all unique details. If an entry is clearly already done (verify against the codebase and git history, e.g. merged PRs), mark it done consistently (keep the repo's existing done convention, e.g. `[x]`) or move it to a 'Done' section at the bottom of that file. Don't delete information silently. Also note in the PR body anything whose status you couldn't verify.
3. **Group into sections.** Organize entries under clear headings by game area (e.g. Rendering/WebGPU, Terrain & Map Generation, Units & Combat, Naval, Air/Jets, Economy & Buildings, AI, Multiplayer/Networking, UI/Sidebar/Settings, Audio & Voice, Missions & Campaign, Performance, Landing page/i18n, Saves/Replay, Tooling/CI, and so on, based on what's actually there). Order the sections consistently across the three files, and add a short table of contents at the top of each file.
4. **Link every entry to its spec.** Find the repo's existing spec/design documents (search for folders like `specs/`, `docs/`, `.cursor/`, `TODO/specs`, and any markdown describing features) and link each entry to the most relevant existing spec with a relative Markdown link. If no spec exists for an entry, do NOT invent one. Mark it consistently (e.g. `Spec: none`), and list those entries in the PR body so Patrick can decide whether specs should be written.
5. **Beautify.** Use consistent Markdown: one checkbox list style, consistent entry format (short title, one-line description, spec link, optional related PR/issue link), no stray whitespace or broken formatting, working relative links, and preserve any conventions the repo's AGENTS.md / .cursor rules / skills require about these files (read them first and follow them; if a rule says new features must be logged in a certain way, keep that format compatible). If a repo rule or skill describes how agents append to these files, update it to match the new structure.

Verify all relative links resolve (write a quick script to check). Run `npm run lint:fix:changed` if it touches markdown, otherwise skip. PR body: summary of the structure, counts of entries per file before/after, the entries moved between files, the duplicates merged, the entries marked done, and the list of entries with no spec. Report back the PR URL and those stats.
