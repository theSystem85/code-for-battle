# Localhost sprite reproduction settings

UTC: 2026-11-04T22-16-36Z
Harness: Codex desktop. Exact model deployment/version, reasoning level and token telemetry are unavailable.

## Prompt

The affected URL is localhost:5137. Only the Custom sprite sheets checkbox was changed; all sprite sheets are enabled by default.

Continue the active hardware-GPU runtime-toggle investigation. The reproduced checkbox/default-selection sequence matches this clarification; verify the served checkout on port 5137 after the current isolated capture.

Verified the same checkbox/all-default-sheets workflow on a fresh server at port 5137 after finding no listener there. The second five-minute hardware capture retains all 169 GPU pages at unchanged DPR 2. See the custom-sprite lifecycle spec for exact results and remaining deadline misses.
