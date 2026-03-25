2026-03-25T00:50:00Z
copilot

User reported the replay determinism comparison still only reached `96.85%` overlap and asked to identify and fix the non-overlapping issues, while ensuring the comparison output focuses only on the save-state parts that actually differ so the remaining drift can be traced to the root cause.

Applied changes fixed saved gameplay timestamps that were still using wall-clock time (`performance.now()`) for mines and wreck recycling/creation, and updated the Playwright replay comparison to canonicalize save payloads before overlap analysis by stripping UI/analytics-only branches, sorting comparable collections, and reporting grouped mismatch-only branches instead of raw leaf noise.