# Repository TODO management

TODO ID `FEAT-77361c9a334540aebba139bd2302efb5`

## Use the skill

In a Codex session rooted at this repository, open the skill picker with `$` and choose **to-do-list**, or start a request with `$to-do-list`. Codex discovers project skills under `.agents/skills/`. If the current client has not refreshed its catalog, start a session in the repository or ask Codex to follow `skills/to-do-list/SKILL.md` directly.

In Grok Build, run `/to-do-list` from the repository checkout. The CLI discovers the wrapper in `.grok/skills/`. In Grok Bot, ask it to follow `skills/to-do-list/SKILL.md` from the current `dev` checkout. A Bot private skill may point to that file. A chat without repository tools can draft the agreed items for handoff to a coding harness. See [Grok Build skill discovery](https://docs.x.ai/build/features/skills-plugins-marketplaces) and [Grok Bot skills](https://docs.x.ai/grok-bot/skills-routines-and-automations).

Examples include “$to-do-list Show the open aircraft bugs”, “$to-do-list Add these three ideas and ask about their unresolved rules”, and “$to-do-list Mark BUG-… revision 2 as manually failed. The command still resets the route.” Edit and verification requests use the data-only workflow. Ask separately to implement a task.

## Canonical records

`TODO/records/[0-7].jsonl` is the live backlog. Each UTF-8 line is one schema v1 record. The last hexadecimal digit of the ID modulo 8 determines the shard and records are sorted by ID. This provides targeted reads and bounded HTTP requests. Concurrent operations on independent records are replayed using the CLI instead of merging adjacent lines by hand.

| Fields | Meaning |
|---|---|
| `schemaVersion`, `id` | Schema version and immutable ID. The prefix reflects initial classification and the suffix is a random UUID in compact hexadecimal form for new records. |
| `type`, `title`, `description`, `subsystem`, `priority`, `complexity`, `tags?` | Type prefixes are BUG, FEAT, IMP, REF, PERF, TEST, and DOC. Priority is critical, high, normal, low, or untriaged. Complexity is XS–XL or unknown. |
| `acceptanceCriteria`, `questions`, `dependencies`, `references`, `blocker?` | Lists of conditions, questions, canonical dependency IDs and source references. Missing or circular dependencies fail validation. |
| `createdAt`, `updatedAt`, `status`, `revision`, `batchId?`, `implementationRefs`, `implementationNotes?` | UTC timestamps, implementation lifecycle and revision, optional batch and implementation provenance. |
| `verificationStatus`, `lastVerifiedRevision`, `verificationHistory`, `verificationNotes?` | Separate manual QA lifecycle. History preserves result, revision, date and optional observations. |
| `manualTestPlan?` | Prerequisites, setup, regression checks, platforms/input methods, estimated minutes, optional scenario, and steps with stable IDs, actions and expected results. |
| `promptIds`, `clarificationPromptIds`, `legacyIds?` | Traceability links into dedicated prompt history and optional aliases to old IDs. |

Implementation statuses are NEEDS_CLARIFICATION, READY, IN_PROGRESS, PARTIALLY_IMPLEMENTED, IMPLEMENTED, BLOCKED and CANCELLED. Verification statuses are NOT_APPLICABLE, NOT_TESTED, PASSED, FAILED and RETEST_REQUIRED. A READY record needs concrete acceptance criteria and a complexity estimate. The CLI's `ready` query additionally resolves prerequisites. A subsequent batch selector can weight XS/S/M/L/XL with configurable point costs and group by subsystem, type and dependencies.

The import includes open and completed entries from the categories and brainstorm list. The original files preserve exact wording and provenance. The import preserves B-number lookup, checkbox state and available references. Import timestamps represent migration when source dates are unknown. An old completion goes in Completed with a historical QA note. Open imports need scope review before entering READY. Historic source comments and released notes did not carry these IDs. The canonical records point to their original entries and linked specs so agents can add traceability as they revisit the code.

## Lightweight commands

Run commands from the repository root. Node 18+ and Git suffice for the CLI and changed-path check.

```sh
node scripts/todo.mjs query '{"text":"patrol","type":"feature"}'
node scripts/todo.mjs query '{"ready":true,"subsystem":"Units and Combat"}'
node scripts/todo.mjs get B-001
node scripts/todo.mjs prompt <interaction-id>
node scripts/todo.mjs id bug
node scripts/todo.mjs apply < /tmp/todo-interaction.json
node scripts/todo.mjs staged
```

`apply` reads one JSON interaction from stdin. Its fields are `operation` (create, refine, cancel, verify or reconcile), `text` (reviewed original prompt for text interactions), optional `harness`, `previousPromptIds`, `clarification` and `voice`, plus `changes`. Each change is an `{ "id": "<canonical-id>", "create": { ... } }` or `{ "id": "<canonical-id>", "expectedToken": "<editToken from get>", "patch": { ... } }`. Supply title, description, type and subsystem on creation. Set at least one question for NEEDS_CLARIFICATION. On patch, `advanceRevision: true` starts a new tested implementation revision. A manual result uses `verification: { "status": "PASSED", "revision": 2, "notes": "Optional observation" }`. The CLI detects exact normalized title duplicates and requires `confirmDistinct: true` for an intentional duplicate. Use search and spec review for overlapping ideas with different titles.

Text changes append one UUID-named JSON record per interaction under `prompt-history/todo/`. Each entry holds the original redacted text, timestamp, agent identifier when known, operation, affected TODOs and previous prompt references. Use `voice: true` when saving an agreed voice draft. History is public Git data. Review content before committing. Pattern-based masking is a second pass for common credentials. Individual prompt files stay off the in-game surface.

## Publication and deployment

The tab loads on demand in local Vite development and the Netlify dev branch build. Local Vite reads the current checkout. On dev the browser revalidates GitHub's public dev ref and fetches the eight canonical shards by immutable commit hash. Unchanged refs reuse the current snapshot. A failed refresh keeps the last complete snapshot for the current session and displays an error. GitHub cache propagation, availability, and unauthenticated rate limits bound freshness. Opening the tab and Refresh are the read triggers. There is no gameplay polling.

Shards are public in GitHub and require no browser credentials or additional hosting configuration. Only backlog shards are fetched. The game creates text nodes for task content. The TODO view and its release links are gated in the production game. The production release archive can show reference IDs as text. Git data stays publicly readable.

The running dev build carries the per-task implementation revisions present when it was built. Awaiting QA includes only matching revisions on deployed builds. The combined open view can show changes waiting on a build, with availability in the record details. A local dev session labels deployed availability unknown.

`scripts/todo-paths.mjs` accepts only modifications to the eight shards and additions of individual history files. It rejects mixed paths, renames, deletions, merges, missing ranges and non-fast-forward ancestry. It checks each commit in the available range so a source change and its later revert still receive normal verification. Local validation also checks the staged content and preserves record and history identity. Direct `dev` pushes already have no GitHub Actions workflow. Main CI preserves the required smoke-test check and skips its application steps only for a classifiable TODO-only range. Netlify skips the dev application build, smoke test, and deployment only when the full cached-to-current range qualifies. Unavailable Git history or a build hook can cause a normal build. Production and PR preview deploys retain their existing Netlify build behavior.

The in-game view is read-only. The next phase can add authenticated QA writing and scenario launching using the existing record and step IDs.
