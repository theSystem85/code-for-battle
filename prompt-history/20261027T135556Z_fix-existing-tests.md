# Fix existing regression tests

UTC: 2026-10-27T13:55:56Z
Model: GPT-6 (exact deployed version, reasoning level, token counts and elapsed task telemetry unavailable).
Harness: Codex desktop, managed cloud environment.

User request:

Fix the tests afterwards in a new commit on dev.

Context: This authorizes pushing the completed background game update commit first despite four verified pre-existing failures, then fixing those failures and committing/pushing the fixes separately on dev.

Resolution: update the aircraft-selection command double and assert the exact selected aircraft, landing structure and slot passed to the current landing command. Verify exact recorded narration for unchanged scripts; explicitly require the current text through TTS, with no stale audio playback, for welcome, tech-tree and advanced chain-planning scripts. Recording metadata and binary audio files remain authoritative.

The adjacent aircraft browser check also exposed stale fixture assumptions. The follow-up gives its small map explicit airstrip footprints, centers the camera, waits for loading/setup to settle, uses the current tutorial storage keys, pauses flight simulation while checking command guards, and reselects after right-click deselection. Console/page-error checks cover the command exercise after fixture preparation.

Validation: 5,748 unit/integration tests passed in the full run; all three targeted browser cases passed; lint passed. An earlier full unit run's UI timeout under concurrent browser load passed both in isolation and in the subsequent full run.
