# Lighthouse Performance Remediation Plan (Top 10)

Source report: `tests/lighthouse/default.report.json` (generated locally with `npm run lighthouse`; reports are no longer committed).

Current Lighthouse performance baseline:
- Performance score: **0.20**
- FCP: **9.0s**
- LCP: **109.9s**
- TTI: **110.1s**
- TBT: **720ms**
- CLS: **0.365**
- Total network payload: **18,375 KiB**
- Requests / scripts: **399 / 233**

## Weighted top 10 TODOs

Weighting method: impact was prioritized according to Lighthouse metric weights (LCP 25%, TBT 30%, CLS 25%, FCP 10%, SI 10%), then adjusted by report-specific savings (bytes/ms) and implementation feasibility.

1. **P1 (Weight 10/10): Ship production-minified JS and enable compression**  
   Evidence: `unminified-javascript` estimated savings **12,966 KiB**.
2. **P2 (Weight 9.5/10): Introduce route/module code-splitting for startup-critical path only**  
   Evidence: very high LCP/TTI (109.9s/110.1s), 233 scripts requested.
3. **P3 (Weight 9.0/10): Collapse request fan-out by bundling module graph**  
   Evidence: 399 requests, 18,375 KiB total payload.
4. **P4 (Weight 8.5/10): Reduce main-thread boot cost and long tasks**  
   Evidence: `mainthread-work-breakdown` 4.8s, `bootup-time` 1.9s, TBT 720ms.
5. **P5 (Weight 8.0/10): Eliminate startup-unused JS and dead feature imports**  
   Evidence: `unused-javascript` savings 669 KiB.
6. **P6 (Weight 7.5/10): Remove render-blocking CSS and inline critical above-the-fold styles**  
   Evidence: `render-blocking-insight` savings 700ms.
7. **P7 (Weight 7.0/10): Fix CLS by reserving stable layout boxes and preventing UI reflow**  
   Evidence: CLS 0.365 and 12 layout shifts.
8. **P8 (Weight 6.5/10): Optimize image delivery (dimensions, compression, responsive sources)**  
   Evidence: `image-delivery-insight` savings 238 KiB.
9. **P9 (Weight 6.0/10): Add robust static-asset caching and cache-busting policy**  
   Evidence: high repeat-download risk with very large asset footprint.
10. **P10 (Weight 5.5/10): Remove forced reflows and startup console/runtime errors**  
    Evidence: `forced-reflow-insight`, `errors-in-console`, and deprecations are failing.

## Specs for independent coding agents

- `specs/lighthouse-performance/01-production-minification-compression.md`
- `specs/lighthouse-performance/02-startup-code-splitting.md`
- `specs/lighthouse-performance/03-request-fanout-bundling.md`
- `specs/lighthouse-performance/04-main-thread-long-task-reduction.md`
- `specs/lighthouse-performance/05-unused-js-elimination.md`
- `specs/lighthouse-performance/06-critical-css-render-blocking.md`
- `specs/lighthouse-performance/07-cls-stabilization.md`
- `specs/lighthouse-performance/08-image-delivery-optimization.md`
- `specs/lighthouse-performance/09-static-asset-caching-policy.md`
- `specs/lighthouse-performance/10-reflow-console-errors.md`
