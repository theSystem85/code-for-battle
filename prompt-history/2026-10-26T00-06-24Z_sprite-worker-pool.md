# 2026-10-26 00:06:24 UTC — Sprite worker pool

Processed by Codex using GPT-5.6 Sol.

Implement only sprite-streaming lane S07 on the `dev` base: persistent bounded sprite preparation workers with worker-side fetch/decode, metadata-aware keying and group cutouts, transferable bitmap results, cancellation, backpressure, capability negotiation, recovery, byte accounting, and explicit unsupported states. Stay within S07-owned paths, add focused tests and required change/release/prompt-history notes, run the mandated focused checks, and commit using Conventional Commits.
