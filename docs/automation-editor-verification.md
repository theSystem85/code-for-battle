# Automation editor verification

The native textarea exposes accepted CFBL. Syntax tokens use parser roles; provisional composition/search stays outside accepted source. Input handlers run only in the open editor, with no simulation-loop work. The completion list pages 40 choices at a time.

## Palette contrast

WCAG relative luminance ratios against the actual `#272822` background:

| Foreground | Ratio |
|---|---:|
| `#f8f8f2` | 13.94:1 |
| `#ff78ad` | 6.05:1 |
| `#a6e22e` | 9.58:1 |
| `#e6db74` | 10.44:1 |
| `#c7a9ff` | 7.47:1 |
| `#66d9ef` | 9.01:1 |

All token foregrounds exceed 4.5:1. The mirror is noninteractive and aria-hidden; source selection, caret and focus remain native. A highlighting exception restores visible plain text.

## Verification scope

`npx vitest run tests/unit/cfblEditor.test.js tests/unit/basePolicyUi.test.js tests/unit/policyConditionRows.test.js tests/unit/policyMachineView.test.js --maxWorkers=2` passed 35/35 tests. Unit interactions cover provisional typing/composition, valid and invalid paste, shared accepted-history undo/redo, WHILE UNTIL and nested selected-condition edits, tiny decimals, DAV/ATV synchronization and ELSE, indexed diagrams and deletion cancellation. The integration orchestrator runs the complete unit suite and release browser flows. Real-phone p95 input latency, iOS predictive input/IME, VoiceOver and physical iPhone/iPad keyboard viewport behavior still require device verification; desktop/headless checks do not certify those results.
