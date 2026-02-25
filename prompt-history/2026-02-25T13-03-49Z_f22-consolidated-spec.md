# Prompt History
- UTC: 2026-02-25T13-03-49Z
- LLM: copilot

## Prompt
now summarize all the requirements of this chat into one regarding the F22 (not the street feature) and number them so we can make a checklist of everything that is already working and everything that still does not work. If there are conflicts of my specs let the latest specs overwrite the older ones. If you have questions and sth is unclear let me know. Generate a spec file (or update the existing one for the F22) with feature numberings and cluster them so that each cluster can be wokred on by a different agent in parallel (when different files are affected).

## Implementation Notes
- Rewrote `specs/021-f22-raptor-unit.md` into a consolidated F22-only (non-street) requirement spec.
- Added numbered feature IDs grouped by parallelizable clusters tied to primary file ownership.
- Applied conflict-resolution rule explicitly: latest requirements override earlier ones.
- Added per-item status labels (`Implemented (code)`, `Needs gameplay verification`, `Open`) and a runtime verification checklist.
- Updated TODO tracking entry in `TODO/Features.md`.
