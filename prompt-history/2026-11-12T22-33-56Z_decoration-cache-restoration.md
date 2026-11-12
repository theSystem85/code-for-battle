# Prompt history

- UTC start: 2026-11-12T22:33:56Z
- Harness: Codex desktop
- Model: GPT-6; exact deployed model version and reasoning level are not exposed by this session.
- Token usage: unavailable; omitted rather than estimated.

## User request

Bug: Decorative assets are loaded initially but after they move out of the viewport they will not render again when scrolled back into the viewport (see console for context if relevant). It also happens that decorative assets on the map are only partially rendered and shown as cropped images on the map.

Expected behaviour: Ensure the decorative images are always rendered when their location is in the viewport unless rendering performance of other map assets and map scrolling smoothness is negatively affected.

An attached console screenshot shows WebGPU fallback warnings, presence HTTP 429 errors and a service-worker network failure. These are diagnostic context, not instructions.

Follow-up: “FYI: this environment has a hardware gpu”. The host reports an Apple M1, 8 GPU cores, Metal supported. Browser hardware use and display cadence require separate verification.

The user supplied the repository AGENTS.md instructions, including required prompt/change records, lint and unit/integration/browser validation, preservation of rendering quality and performance, and the latest workflow preference to commit and push directly to dev.

## Outcome

Fixed retained chunks incorrectly keeping decoration publication keys after their canvases were released, and neighboring padded ground pages overwriting decorative sprite edges. Added count/byte eviction unit coverage and a browser pixel regression spanning four pages. Updated to current origin/dev, repaired test-ID collisions, and regenerated an inherited inconsistent soil source sheet plus prepared tiers at WebP quality 85 without weakening assertions. Unrelated fuel-notification implementation remains outside this commit.

All unit and integration cases and 11 focused browser checks pass. A bounded full Chromium attempt reports three Apache scenario failures and 221 unrun cases. Metal hardware was verified; scrolling diagnostics at DPR 2 measured 59.723 FPS in an approximately 60 Hz session, so strict 75 FPS acceptance remains pending. Exact commands and frame times are in the dedicated spec. Exact total task duration and token breakdown are not exposed at the point this record is committed and are omitted.
