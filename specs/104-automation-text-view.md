# 104 — ATV: constrained text editing, fuzzy completion, and highlighting

Status: specified, not implemented. Read [099](099-automation-cfbl-program.md). Dependencies: [100](100-cfbl-language-and-coverage.md), [101](101-automation-source-sync-and-migration.md), [102](102-automation-if-else-runtime.md); use the shell contract from [103](103-automation-default-view-and-state-indexes.md). Own ATV internals; never create a second editor/store/grammar.

## Experience

ATV shows the shared CFBL source in a real multiline text-area input, syntax-colored over a dark background, with a grammar-aware flyout anchored near the caret. No unrestricted “expert mode” that bypasses grammar legality. Opening an existing DAV automation displays its code immediately; selecting an allowed option updates shared source and DAV projection as one transaction. Desktop keyboard and iPhone touch can complete the same task without knowing token spellings.

The editor is a **guided code builder**, so token choice must remain easy when free typing is constrained. The user can place a caret/select a token or statement, search legal options, choose, insert/remove/reorder whole constructs, copy code and undo. A clear inline **Choose next token** action opens options even with an empty query. There is no dead end when an incomplete keyword cannot be inserted.

## Committed source versus transient query

1. The actual text area's accepted value is the shared committed source. On typing at a grammar slot, capture printable input as a transient search/composition query at that position, visually shown in the flyout or a clearly separate inline query affordance. The query may contain illegal/incomplete spellings, but is never inserted into accepted source. Keep the real caret/selection accessible.
2. Completion derives the typed slot and replacement/insert operation from `completionContext`. First restrict to grammar-, category-, parameter- and reference-valid choices, then fuzzy-rank those choices. Search labels, CFBL spellings and descriptions (e.g. “tank 2” finds `tank-v2`). Exact match > prefix > token/word match > subsequence/edit distance; use stable catalog order to break ties. Fuzziness never broadens legality or inserts the query verbatim.
3. A keyword or enum is committed only after explicit click/tap/Enter/Tab selection. Space does not automatically insert an unselected word. Selecting the same option may be a no-op. Punctuation with a single legal structural consequence may be inserted through its completion action; no arbitrary token strings are accepted.
4. A numeric slot offers a bounded number field/input mode and useful legal suggestions (bounds, default, existing value). Validate finite value, decimal syntax, domain/mode and integer-only quantity/delay/index constraints before **Use value** commits it. Do not enumerate billions of numbers. State indexes offer only existing legal targets; new declaration numbers are generated, not typed.
5. Accept whole structural templates (new state/rule, parameterized call, AND/OR/NOT group) with legal defaults. Source remains structurally parseable between interactions. Temporary field/query composition is UI staging, never another source of truth. Reject semantically invalid structural edits or route to the coordinated repair operation (e.g. deleting a referenced state).
6. For a new automation, show four category choices before code is generated, then a legal skeleton (`scope`, `run`, `start`, wait state). New-category search can start in an empty query view, but committed code appears only once a legal skeleton is selected. Saved category changes use the same restriction as DAV.

## Editing and input paths

Use `beforeinput` where available plus guarded `input` fallback; handle selection replacement, key input, touch keyboard, predictive replacement, dictation, drag/drop, clipboard, composition, browser undo/redo and programmatic input. Do not depend on `keydown` alone. For IME keep composition in staging and validate/select at composition completion; never destroy a live composition by repeatedly resetting DOM selection.

- Selecting a token opens a replace menu restricted to that token's slot. Selecting an action, rule, condition group or state opens legal replace/delete/reorder operations. A token changed with raw typing starts a query rather than corrupting the surrounding document.
- Backspace/Delete can remove complete optional arguments/ELSE/rules/groups/states through controller transactions. If raw deletion would leave malformed source, open the smallest valid structural delete/replace operation; preserve input and explain the available operation. Plain whitespace edits may be accepted if grammar remains valid, then canonicalized at a safe boundary with selection mapping.
- Paste a complete valid CFBL program or context-valid fragment: parse, validate and apply atomically; when inserting a fragment, validate the resulting program. Invalid paste leaves accepted source unchanged and shows the specific first error and repair choices. It may remain in a separate import-repair preview, but cannot execute/export as accepted source. Never silently strip illegal words and change the meaning.
- Copy/select-all returns the shared source. Native undo/redo routes accepted code operations to the controller history; transient query undo affects only the query. Test platform-specific `historyUndo/historyRedo` inputs.
- Escape first closes flyout/query without closing the Automation dialog; a second Escape can close through the shared shell. Flyout events stop propagation to game movement, attack and hotkeys. Taps cannot leak through to the map.
- Enter/Tab choose the highlighted option while the flyout is active; ArrowUp/Down move through choices. Without a flyout, Tab may open choices or move focus according to the documented accessible pattern; Shift+Tab exits to the previous control. There must always be a way to leave the input without a keyboard trap.

## Flyout and accessibility

Show label, exact inserted CFBL token/snippet, brief meaning, legal values/defaults, numeric unit/range, category and applicability notes. Context examples include `.relative` explaining fractions, `.absolute` explaining unit counts, available delivery orders, current `goto` indexes, and IF's ELSE action. Empty/no-result states offer **Clear search** and all legal choices at that location; never allow an illegal commit button.

A grammar-legal option may be temporarily unavailable in the current match (locked tech, no factory/money/target). Keep it authorable, annotate its game requirements and retain execution-time checks. Separate grammar legality from present runtime affordability. Conversely, fixed defence capabilities constrain actions for an individually selected building; a global defence automation can author capability-dependent actions with applicability help and runtime no-op diagnostics.

Use `aria-autocomplete="list"`, a labelled `listbox`/`option` arrangement and `aria-activedescendant`/expanded status on the focused input as appropriate. Announce number of available choices and selected option without reading the entire source on every edit. Screen readers can read plain source; colored overlay is `aria-hidden` and noninteractive. Provide an explicit description of guided token choice and numeric entry. Touch rows/primary controls are at least 44×44 CSS px.

Clamp/reposition the flyout inside the dialog and visual keyboard viewport. Prefer above caret when needed. Maintain a maximum-height scrolling options list; flyout is not clipped by code scroller overflow. Reposition on selection, scroll, orientation, font size and visualViewport changes, throttled only while open. Phone landscape/portrait and iPad split-screen must be usable. Never use native `title` as the only explanation; use existing custom tooltip/flyout conventions.

## Syntax highlighting and dark contrast

Use a real textarea and a noninteractive tokenized `<pre>` overlay/mirror, or an equivalently accessible implementation retaining the native input. The overlay may color text while the textarea exposes transparent glyphs and a visible caret; verify selection/readability on iOS. Both layers use identical font, line height, padding, tab/whitespace handling, wrapping and scroll offsets. Fallback if the overlay fails is readable plain text, never invisible source.

Monokai-inspired candidate palette on `#272822`: plain `#f8f8f2`, grammar keywords `#ff78ad`, effect/field/check calls `#a6e22e`, enum terminals `#e6db74`, numbers `#c7a9ff`, punctuation `#f8f8f2`, mode/parameter keys `#66d9ef`. Verify actual contrast of each foreground against the real background (at least 4.5:1 for normal text); adjust failing shades. Selection, caret and focus ring remain visible in all token colors. ELSE/WHILE/AFTER still have textual cues; no meaning relies solely on color.

Tokens/colors derive from lexer/catalog roles, not a loose regex that treats every word as a valid identifier. Invalid staged queries/errors appear in UI outside committed code. Safely escape all source text when rendering spans (`textContent` or equivalent); pasted text is inert, never HTML. Do not add large per-frame canvas effects to highlight active lines.

## Performance and acceptance

Load editor-only modules lazily if needed. Tokenization/highlighting/completions run on edits/selection changes only while ATV is open, never in the AI/game loop. Cache static fuzzy indexes; filter by current parser context before ranking. Use bounded result pages with access to all legal options; don't perform an entire game-world scan per keystroke. Preserve native focus during incremental updates. Target p95 ≤50 ms for input-to-flyout/highlight on the reference stress document from 101 on the reference phone; record the device, source size and input method. Include larger real records when the inventory finds them. If work is asynchronous, discard responses for stale draft revisions and never let a stale choice mutate the current document.

Acceptance includes full feature examples from 100; mid-document replace; numeric bounds; false search spellings; zero-result search; valid/invalid paste; composition/autocorrect/dictation; drag/drop; selection/delete/undo across view switches; all existing templates; keyboard and touch completion; contrast and screen-reader checks; iPhone keyboard/flyout clipping; no game hotkeys firing while typing. Assert source remains legal after every accepted interaction and DAV projection matches the same revision. Browser E2E must drive genuine textarea events rather than only setting controller ASTs.

Run all unit tests and lint after focused parser/controller/editor tests. Handoff: ATV adapter, source-selection mapping, token palette/contrast report, keyboard/input behavior tests, phone interaction evidence and selectors for 108 screenshot capture.
