# Smoke lint Event global

- [x] **Smoke lint no-undef Event**: after #728, CI smoke-test `npm run lint` failed on `tests/unit/basePolicyUi.test.js` (`'Event' is not defined`). Declared the browser `Event` global as `readonly` in `eslint.config.js` next to `CustomEvent`. Spec: none
