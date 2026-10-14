# Startup updates and release digest

- A small startup entry point checks for waiting and newly available service-worker updates before importing game systems. It waits for installation, requests activation, and reloads into the new shell before world initialization. A session guard prevents reload loops. Offline, forced-offline, unsupported service workers, failed installation, and bounded network/activation timeouts allow ordinary startup. Updates arriving during gameplay retain the existing manual update behavior.
- Version 0.47.0 introduces versioned release-note JSON in `features/`, separated into features, improvements, and bugfixes. Numeric version comparisons include skipped releases and exclude the previous version and future notes.
- Updated loading screens show previous and current versions, category counts, and one single-line highlight at a time. Features take priority; when there are none, improvements and bugfixes provide highlights. Long lines can be scrolled horizontally without wrapping.
- The loader measures startup through `ready`, stores that device's last duration locally, and distributes highlights uniformly over that estimated duration on the next startup (10 seconds before a measurement exists). Real readiness still controls when gameplay begins; notes never add an artificial delay. Faster loads may finish before every highlight appears. Slower loads retain the last highlight.
- The User Manual renders all three categories with the same release-digest component and preserves the latest successful update's diff across reloads. Storage failures never block startup.
- Agent instructions require brief release notes for every feature, improvement, and bugfix alongside existing change notes and prompt history.

Validation: unit coverage exercises activation before startup, updates discovered during checking, offline/failure/timeout paths, reload guards, skipped-version digests, row timing, shared rendering, and persistence. Production build verifies the split entry point and service worker.

No gameplay update/render hot paths are changed; loading-only timers stop when the loading screen hides.

Verified in the managed environment:
- `npm run test:unit -- --maxWorkers=4`: 241 files, 4,697 tests passed.
- `npm run test:smoke`: browser initialization smoke test passed.
- `npm run lint:fix:changed`, `npm run lint`, and `npm run build`: passed.
- Chromium production-browser check: updated loading versions/highlight visible, successful loading duration persisted, and all categories present in the User Manual; no uncaught errors.
- Chromium with a real predecessor worker followed by the production worker: one update reload, game absent at activation, and updated version successfully loaded. The seed page plus initial game navigation plus update reload produced exactly three navigations.
