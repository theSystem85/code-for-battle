UTC timestamp: 2026-10-21T22:49:18.806598+00:00
Model: GPT-6 (Codex harness; exact model version, reasoning level and token counts are not exposed).

User request:

1) Fix the SSE tags section styling (referenced screenshot was not attached).
2) In Extend sprite sheet, detect source transparency and use transparent backgrounds instead of black for click and automatic sprite extraction. Hide inner-cuts and near-black cutoff for transparent sources. Select an appropriate edge/isolation algorithm; add transparency-specific sidebar settings if useful. The referenced example image was not attached.
3) New sprite sheets must support WebP with transparency by default.

Make all changes directly without an MR. The user asked whether there were questions before starting.

Implementation: alpha-based eight-connected component isolation, configurable alpha cutoff/gap/minimum size, transparent target lifecycle, and stable scrollable tag rows.

Validation: lint and production build pass; all 86 integration tests and 8 SSE Chromium E2E tests pass. The full unit run covered 5,353 tests: 5,349 passed initially, and the four sandbox-blocked release-script tests passed when their five-test file was rerun with Git subprocess access. No MR was created; changes remain in the current workspace. Referenced screenshots were not available.
