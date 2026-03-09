# Spec 053: Runtime Config Fuzzy Search

## Goal
Improve runtime tuning workflow by adding an inline fuzzy search input to the runtime config editor.

## Requirements
- Add a search input at the top of the runtime config editor dialog.
- Search must match against:
  - Variable display name
  - Internal variable ID
  - Current value (stringified)
- Matching should support fuzzy subsequence behavior (e.g., `xpmult` matches `XP Multiplier`).
- While search is active, show matching configs from all categories as one filtered result list.
- Search results must keep the existing editable controls so users can update values directly from filtered results.
- Read-only configs must remain read-only.
- When no entries match, show an explicit empty-state message.

## Validation
- Add a Playwright E2E test that opens runtime config dialog, searches a config by fuzzy term, edits the config in the filtered list, and validates the shown value updates.
