# 2026-10-04 — Smoke lint: Event is not defined

## Bug

- [x] **CI smoke lint fails because `Event` is not defined** — `tests/unit/basePolicyUi.test.js` dispatches a DOM `change` event, and ESLint's `no-undef` rule does not know the browser `Event` global. `Event` is now a readonly global in `eslint.config.js`, next to `CustomEvent` and `MouseEvent`. `npm run lint` is clean.
  - Spec: none
