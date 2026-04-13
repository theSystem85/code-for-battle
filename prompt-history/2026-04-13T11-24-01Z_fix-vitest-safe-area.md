2026-04-13T11-24-01Z
LLM: copilot

## Prompt

fix this errors:

✓ tests/unit/helpSystem.test.js (1 test) 3ms
⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯

Vitest caught 4 unhandled errors during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
ReferenceError: document is not defined
 ❯ syncSafeAreaInsets src/ui/deviceLifecycle.js:63:3
     61| 
     62| function syncSafeAreaInsets() {
     63|   if (!document.body || !document.body.classList.contains('is-touch'))…
       |   ^
     64|     return
     65|   }
 ❯ Timeout._onTimeout src/ui/deviceLifecycle.js:90:27
 ❯ listOnTimeout node:internal/timers:585:17
 ❯ processTimers node:internal/timers:521:7