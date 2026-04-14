# 061 - Multiplayer invite status on button

## Summary
Remove redundant per-player `Invite ready` sidebar labels and communicate invite lifecycle state directly on each party invite button.

## Requirements
- Multiplayer party status text must no longer show `Invite ready`, `Generating invite...`, or `Copied!`.
- Invite status feedback must be shown on the invite button text itself:
  - `Invite` when no invite token exists.
  - `Generating…` while invite creation is in progress.
  - `Copied!` immediately after invite generation and clipboard copy attempt.
- Party rows must not render defeated status text labels; defeated state is represented on the invite button itself for invite-capable rows.
- Defeated parties must show `Defeated` on their invite button, and that invite button must be disabled.
- Existing non-invite status text behavior (for example `Reconnecting`, `Invite failed`, `Available`) must remain unchanged.
- Multiplayer party owner labels must be rendered inside the colored badge (left-side bubble) instead of as separate text to save horizontal space.
- Party badges with yellow-like backgrounds must use dark text for contrast.

## Validation
- Unit/manual: render multiplayer sidebar with no invite token and verify invite button label is `Invite`.
- Unit/manual: trigger invite generation and verify button label progression to `Generating…` then `Copied!` then `Invite`.
- Unit/manual: mark a party as defeated and verify that party invite button label is `Defeated` and button is disabled.
- Unit/manual: verify party status text no longer displays `Invite ready` or `Defeated` and still shows `Reconnecting`/`Invite failed` as applicable.
- Unit/manual: verify each row shows owner text inside the colored party badge and no separate owner text label beside the badge.
- Unit/manual: verify yellow party badges render dark (black-ish) text instead of white.
