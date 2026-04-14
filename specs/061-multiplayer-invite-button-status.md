# 061 - Multiplayer invite status on button

## Summary
Remove redundant per-player `Invite ready` sidebar labels and communicate invite lifecycle state directly on each party invite button.

## Requirements
- Multiplayer party status text must no longer show `Invite ready`, `Generating invite...`, or `Copied!`.
- Invite status feedback must be shown on the invite button text itself:
  - `Invite` when no invite token exists.
  - `Generating…` while invite creation is in progress.
  - `Copied!` immediately after invite generation and clipboard copy attempt.
  - `Invite Ready` once an invite token exists and transient copied state resets.
- Defeated parties must show `Defeated` on their invite button, and that invite button must be disabled.
- Existing non-invite status text behavior (for example `Defeated`, `Reconnecting`, `Invite failed`, `Available`) must remain unchanged.

## Validation
- Unit/manual: render multiplayer sidebar with no invite token and verify invite button label is `Invite`.
- Unit/manual: trigger invite generation and verify button label progression to `Generating…` then `Copied!` then `Invite Ready`.
- Unit/manual: mark a party as defeated and verify that party invite button label is `Defeated` and button is disabled.
- Unit/manual: verify party status text no longer displays `Invite ready` and still shows `Defeated`/`Reconnecting`/`Invite failed` as applicable.
