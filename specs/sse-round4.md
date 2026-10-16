# Sprite Sheet Editor round 4

The standalone and embedded editor use the same action controllers and `sse:*` events.

- Imported sprites toggle tags across their entire reserved span, including partial preexisting tags.
- New sheets default to 18 columns and 18 rows; show their live pixel dimensions.
- Source uploads and drops append multiple sheets side by side with a 20px CSS gap. Each source owns pixels, masks, original coordinates and an independent viewport. The source pane also supports shared navigation.
- `addSourceImage(input)` returns a stable session source ID. `loadSourceImage(input)` replaces the source collection and returns state. `getState().sources` lists IDs and dimensions. Isolation/extraction defaults to the last added source; explicit source IDs select any source.
- Source clicks and `toggleSourceSprite` remove existing imports with their tags, occupancy and marker; subsequent clicks reimport. `isolateAt` retains duplicate rejection for compatibility.
- Resize accepts any valid positive span; Shrink/Grow change both dimensions by one with minimum one. Preserve aspect, original source raster and top-left placement. Reject collisions/horizontal overflow before mutation; permit downward growth within budgets.
- Use shared game accordion/button/floating input styles. No HTML title attributes. Mobile sidebar stacks above visible target and source panes.

## Verification

Run `npm run lint:fix:changed`, `npm run lint`, `npm run test:unit`, `npm run build`, and `npx --offline playwright test tests/e2e/sseExtend.test.js --workers=1`.

Editor transformations are input-driven; no game tick/render hot paths changed. Qualifying-hardware 75 FPS certification is not supplied by this sandbox.

Verification results in this sandbox: `npm run lint:fix:changed` and `npm run lint` passed; `npm run build` passed. A full unit run passed 284 files / 5,048 tests, and the additional growth regression passed in the focused controller suite (8 tests across controller/tags). One concurrent run timed out in the unrelated portrait joystick layout test; a subsequent full run passed without changing that test. Browser coverage was attempted with both default and IPv4 localhost hosts; Vite cannot listen (`EPERM`), so the E2E/mobile visual checks remain outstanding. Offline dependency installation succeeded with `npm ci --offline --ignore-scripts`. No version bump or git write operations were performed.

Final full unit run after adding the growth regression: 284 test files and 5,049 tests passed. Lint and production build also passed. E2E execution remains blocked by localhost binding permissions.
