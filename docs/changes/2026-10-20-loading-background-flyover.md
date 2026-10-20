# Improvement

- [x] **Loading background flyover**
  Move the backdrop slowly downward when the cover crop has vertical room, otherwise rightward when there is horizontal room; add zoom only near a matching image/screen aspect ratio. Clip the existing blur outside the screen, stop animation when hidden, and respect reduced motion. Use a single ten-minute easing pass so normal and unusually long loads do not loop or reverse; after ten minutes the background holds its final covered position.

Spec: none

Hardware GPU / 75 FPS acceptance remains pending on Patrick's hardware; functional browser checks do not certify rendering performance. The change animates one background transform in CSS, with no additional JavaScript work per frame or entity and no additional raster effects. Existing blur and overlays are retained.

Functional verification: `npm run lint:fix:changed`, `npm run lint`, `npm run build`, six browser flyover cases (`E00209`–`E00211`), and five existing loading-resilience cases (`E00059`) passed. Browser checks used system Chromium with a temporary Playwright config outside the repository. The unrelated full E2E suite and GPU benchmarks were not run.

All 5,436 unit and integration tests passed across 324 files with `npm run test -- --maxWorkers=2`. The initial `npm run test:unit` run encountered four sandbox-denied Git subprocesses in release-script tests; rerunning with the required subprocess permissions passed without code or test changes.
