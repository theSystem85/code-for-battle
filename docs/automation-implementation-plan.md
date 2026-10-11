# Automation implementation plan — specs 099–108

Status: software implementation complete for specs 100–108; integrated test results are recorded in [release evidence](automation-release-evidence.md). Physical iOS checks and qualifying-hardware 75 FPS release certification remain open. Date: 2026-10-11. Start with [099: shared contract and spec index](../specs/099-automation-cfbl-program.md). The user confirmed IF/ELSE pairs. Terminology has been updated across feature documentation; concrete legacy code/API names stay as technical references.

## How to delegate by number

Give an agent: **“Implement spec 104”** or **“Implement specs 100–102”**. Each numbered file declares dependencies, owned files/interfaces, acceptance and handoff. The assignment means implement and verify those packages, not merely write another plan. Read AGENTS.md and 099 first. A dependency means its contract and functioning code must be available before the dependent package can finish; mocks can support early development only.

Suggested reusable assignment:

```text
Implement spec(s) <number or inclusive range> from specs/099-automation-cfbl-program.md.
Read AGENTS.md, 099, the selected specs and their dependency contracts.
Stay within the declared ownership; coordinate shared exports before changing them.
Preserve all current automation behavior except explicitly specified additions.
Run the package's acceptance checks and repository-required tests/lint.
Report changed surfaces, exact commands/results, dependencies/hardware checks still open,
and a conventional commit message. Do not claim a release gate passed without evidence.
```

No additional product choices are needed to start. Finite keyword choice versus transient search query, bounded number entry, IF/ELSE pairing, display-title metadata, source-backed DAV, seven generated state indexes and phone-only hardware classification are fixed by 099. If real code contradicts a source-audit assumption, report the concrete call site and update the contract before silently diverging.

## Work breakdown and assignment boundaries

| Package | Suggested assignment | Owned output | Blocks |
| --- | --- | --- | --- |
| 100 | Language agent | grammar/catalog/parser/printer/AST/completion context, parity fixture manifest | 101–104, 106–107 |
| 101 | Source/lifecycle agent | shared draft/store/migration/save/replay/network authority | 103–104, 106–108 |
| 102 | State-machine agent | ELSE validation/reference stepping/traces/arbitration | 103–104, 106–107 |
| 103 | DAV/shell agent | automatic state indexes, DAV transactions, title toggle/view host, UI copy | final ATV/mobile integration |
| 104 | ATV agent | input/flyouts/fuzzy search/highlighting/accessibility/selection | screenshots and final docs |
| 105 | Device/layout agent | classifier, phone shell, keyboard/safe areas | final phone/tablet acceptance |
| 106 | Defence agent | capability additions/sensors/commands/bindings/status/lifecycle | complete four-category release |
| 107 | Runtime/performance agent | compile/install, indexed execution/sensing, benchmark evidence | release performance certification |
| 108 | Docs/integration agent | manual/tutorial, EN/DE marketing, real WebP screenshots, integration evidence | final release signoff |

The implementation was delegated in isolated Git worktrees and integrated into one feature branch. The package boundaries below remain useful for maintenance and future fixes.

## Dependency-aware implementation waves

**Wave 0 — Baseline and interfaces.** Capture baseline gameplay/automation benchmarks before any hot-loop changes. Inventory current templates and behaviors in 100. Agree language/catalog/AST, draft transaction, stable identity, editor adapter and compiler contracts from 100/101/103/107. Publish these contracts in code exports or small reviewed patches first. Existing tests provide the behavior oracle; do not defer baseline capture until after optimizations.

**Wave 1 — Language and phone shell.** Implement 100 and 105 in parallel. 105 can finish classifier/shell tests but needs later real ATV integration. 100 includes closed catalogs for planned defence capabilities, flagged unimplemented until 106 is present. Do not expose working-looking defence choices prematurely. Validate all current templates and full vocabulary round-trips.

**Wave 2 — Source lifecycle and branching.** Implement 101 and 102 in parallel after 100, coordinating schema versions and internal branch IDs. 101 implements the explicit host-control/owner-production authority split and records its active routing before runtime integration. 102 stays a simple pure semantic reference. Draft-controller contract lets 103/104 develop independently without inventing secondary stores.

**Wave 3 — Editors, defence, compiled runtime.** Implement 103, 104, 106 and 107 in parallel after their core dependencies. Shared-file ownership is strict: 103 changes header/shared editor only; 104 adds ATV; 105 controls shell sizing; 106 adds capability/adapters; 107 changes execution hot paths. 106/107 agree the defence evaluation pass and intent consumption boundary before touching `updateGame.js`/`buildingSystem.js`. 100's owner reviews any catalog expansion. 101's owner reviews source/revision/save command payload changes.

**Wave 4 — Integration and performance.** Integrate all views/categories with real controller/store/compiler. Run 100 differential fixtures again after 107; drive every category in DAV and ATV. Test phone/tablet with keyboard/rotation, manual defence overrides and owner isolation. Run save/replay/two-peer resync scenarios. Compare whole-game benchmarks to Wave 0, fixing application-caused deadline misses without reducing fidelity or cadence.

**Wave 5 — Documentation and release.** Finish 108 against implemented UI, validate manual examples through the actual parser and capture real screenshots. Run final tests/lint/build/targeted browser suites, complete device and qualifying-hardware evidence, update change-note checkboxes and publish the evidence matrix. Capture screenshots after labels/layout/source stabilize to avoid repeated assets.

For serial implementation, use **100 → 101 → 102 → 103 → 104 → 105 → 106 → 107 → 108**; capture Wave 0 benchmarks first. For a single “100–108” assignment, the agent still observes ownership/dependencies and reports each package separately. Spec 099 remains the controlling contract.

## Required coordination checkpoints

1. **Language parity checkpoint (100):** every existing DAV option represented, all templates and edge-case modes/parameters validated; no loss from named-state conversion, default omission or condition depth.
2. **Source/authority checkpoint (101–102):** one source revision/draft transaction path, recoverable migration, deterministic IDs and source/version inputs, confirmed IF/ELSE semantic tests. No implementation branch can use independently authoritative JSON.
3. **Editor checkpoint (103–105):** view switches preserve source/undo/pause, indexed references survive edits, native input paths cannot commit illegal tokens, real iPhone keyboard works and iPad does not switch to phone shell.
4. **Runtime checkpoint (106–107):** weapon rules/manual priority preserved, no per-tick compiler/parser/normalization, shared sensing and bounded caches, reference/compiled outcomes equivalent, all categories restore/replay deterministically.
5. **Release checkpoint (108):** correct published grammar/examples, localized landing copy and actual screenshots, reproducible integration/results, qualifying-hardware performance acceptance.

## Verification and evidence format

Every implementation handoff records:

```text
Spec(s):
Source revision / branch:
Behavior and API changes:
Acceptance case → test/command → observed result:
All unit tests:
Changed-file lint fix and full lint:
Integration/browser/device evidence:
Performance baseline/after files and device/backend/DPR:
Open dependency, migration, iOS or qualifying-hardware checks:
Conventional commit message:
```

Normal repository commands for code packages are `npm run test:unit`, `npm run lint:fix:changed`, `npm run lint`; release additionally builds and runs targeted real-browser scenarios. Running full lint is mandatory before any commit. Do not invent executable test filenames before they exist; each owner publishes exact commands with its handoff. Pure documentation planning/renames need link/whitespace/consistency checks rather than running game tests.

## Risks and explicit resolutions

| Risk / apparent conflict | Resolution |
| --- | --- |
| Fuzzy typing produces words illegal in CFBL | Query/composition is transient; choose legal tokens to commit. Numeric entry uses validated ranges rather than an infinite flyout |
| CFBL authoritative but DAV still edits JSON | DAV modifies a projection only through shared source transactions; source is generated even without ever opening ATV |
| Automatic indexes shift transition targets | Stable invisible state identities; reorder/delete repairs produce atomic source edits and undo |
| ELSE ambiguity | User confirmed immediate IF/ELSE pairs. False predicate, not missing transition or waiting timer |
| Existing WHILE source effect doesn't run on return | Preserve unit semantics; defence temporary intent cleans up on hold exit without altering the general stepper |
| Compile speedup still leaves expensive target scans | Compile once and share indexed sensing; measure compiler/interpreter/sensors separately |
| Mobile width alone confuses landscape phones and iPads | Hardware-signal classifier with stable screen fallback; keyboard/split-window geometry only sizes the shell |
| “All implemented features” confused with historical wish lists | Current source catalogs/control-unit set are normative; planned sharing/folders/extra units remain out of scope |
| Saves/replay/clients need behavior source and authority | Explicit versioned lifecycle and exactly one execution authority per category in 101 |
| Headless environment cannot certify 75 FPS or Safari keyboard | Document diagnostic checks; real-device and qualifying-hardware evidence stay open until measured |

Possible later ideas: share/import a CFBL snippet with validated owner opt-in, a small template gallery, or richer debugging traces. They are intentionally not prerequisites or extra implementation scope for 100–108.
