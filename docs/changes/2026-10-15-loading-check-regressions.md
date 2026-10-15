- [x] **Bug: unbounded WebGPU frame submission validation**
  Bound the first-frame GPU queue wait and return its completion promise so stalled submission triggers the existing renderer failure/fallback path.
  Spec: none
- [x] **Improvement: loading regression assertions**
  Assert versioned DPR-specific image URLs and revalidated, abortable metadata requests; await validation completion instead of counting microtasks, and cover never-settling GPU submission.
  Spec: none

The reported sprite and metadata assertion failures reflected intentional cache invalidation and cancellation contracts. These assertions now explicitly verify those contracts while retaining exact DPR/path checks. The warning test previously inspected the console after two microtasks; deadline wrapping adds promise scheduling, so the test now awaits the returned validation operation. Investigation also found that `queue.onSubmittedWorkDone()` itself had no deadline, even though the following error-scope wait did. Both waits are now bounded to eight seconds, and failure resets pending validation flags and calls the existing renderer failure handler.

This follow-up retains the existing 0.60.0 minor bump and release notes. It changes no entity/render-loop drawing work: the additional deadline wraps first-frame validation once per initialization/recovery, with one timer per outstanding queue wait. Qualifying-hardware FPS acceptance remains outstanding as documented in 2026-10-15-loading-resilience.md.

Validation: `npm run lint:fix:changed` and `npm run lint` pass; `npm run test:unit` passes (279 files, 5031 tests); `npm run test` passes (281 files, 5117 tests); `git diff --check` passes. The three focused regression files pass (44 tests). The loading Playwright suite was attempted but could not start its web server: the sandbox rejects listening on 127.0.0.1:5173 with EPERM. Browser and qualifying-hardware measurements remain for the operator; no browser success or FPS certification is claimed.
