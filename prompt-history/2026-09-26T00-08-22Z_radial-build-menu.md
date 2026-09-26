2026-09-26T00:08:22Z

Cursor Cloud Agent using Grok 4.7.

Token counts and elapsed time were not available for this run.

## Prompt

Implement a new feature: a circular (radial) build menu on long-press of production buildings.

Behavior:
- When the user taps/clicks and HOLDS longer than 500ms on one of their own production buildings (construction yard/any building that produces buildings, and every unit-producing building such as vehicle factory, airstrip/helipad, shipyard, etc.), a circular menu builds up around that building.
- Build-up animation: small sequential animation where each button flies from the center of the building to its final position on the circle with ease-in-out timing, staggered one after another; the whole menu must be fully built within 1s (quick, snappy).
- The menu contains buttons for ALL build options of that building that are currently available in the sidebar for it (respect tech/unlock requirements and disabled/unavailable states consistently with the sidebar; show unaffordable/locked states the same way the sidebar does).
- Buttons are 50% the size of the buttons in the condensed sidebar and use the same images, but have NO increase/decrease stack-count zones: releasing on a button only adds one (increase only).
- Interaction: user keeps holding after the menu appears, moves mouse/finger over a button (highlight hovered button clearly), and RELEASES on it to build. If the option is a building, the UI goes into building placement/planning mode exactly like selecting it in the sidebar. If it's a unit, that unit is queued/produced explicitly by THAT selected factory (not the default/primary factory). The menu closes immediately on release, whether on a button or outside any button (release outside = cancel, no action).
- Must work with mouse (desktop) and touch (phone/tablet, including iOS Safari: prevent context menu/text selection/magnifier on long press, no page scroll during the gesture). A long-press must not also trigger normal click actions (selection, move orders, box-select); a short click/tap must behave exactly as before. Moving too far before 500ms should cancel the long-press (so drags/box-select/map-scroll still work).
- Keep the circle on screen (clamp/adjust radius or shift center near viewport edges); handle many options (e.g. multiple rings or larger radius) without overlap.
- Works in multiplayer/lockstep: issue production through the same command paths the sidebar uses so it stays in sync and replays correctly.
- If straightforward, also support gamepad (the game has gamepad support: holding A on a building with the gamepad cursor opens it, stick moves highlight, release A builds). Optional, don't overcomplicate.

Architecture: build the circular menu as a REUSABLE component (e.g. src/ui/radialMenu/ with a generic API: open(anchor screen position, items[{id, icon, label, disabled, onSelect}], options{radius, buttonSize, stagger, duration}), pointer tracking, hit-testing, close, animations) that is independent of production logic; then a thin production-specific adapter that builds items from the building's build options. Document the API in a new spec file under specs/ so it can later be reused for other features (e.g. unit command menus).

Performance: no layout thrashing; CSS transforms/opacity for animation, no impact on the frame loop when closed.

Tests: unit tests for the long-press timing/cancel logic, hit-testing, item building for different factories, and that unit production targets the chosen factory. Keep `npm run test:unit` and lint green.

Verify visually: screenshots (mark tutorial completed first) of the menu mid-animation and fully open for a construction yard and a vehicle factory on desktop 1440x900 and phone 390x844, plus hover-highlight state. Include them in the PR description and final report.

Follow AGENTS.md: rebase only, never merge main into the branch, push with --force-with-lease. Other agents are concurrently working on landing-page screenshots and phone-portrait full-screen modals in separate PRs; avoid touching those areas. Open a draft PR and report the PR URL, the reusable API, and screenshot paths.
