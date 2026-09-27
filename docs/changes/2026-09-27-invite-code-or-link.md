# 2026-09-27 — Invite code or link (PR 717)

Notes for this change live here so they are not appended to `TODO/Bugs.md`, `TODO/Features.md`, or `Documentation.md`. Spec: [Invite code or link](../../specs/096-invite-code-or-link.md).

## Feature

- [x] **Join with an invite code or a full link** — the multiplayer join field accepts a full invite URL, a 6-character per-party code, or the long token. Short codes use an unambiguous alphabet, display as `ABC-DEF`, ignore case, spaces, and dashes, and resolve through signalling to the long token. Collisions regenerate, and the code expires with the invite. Labels stay `Invite code or link` / `Einladungscode oder Link`.
  - Spec: [Invite code or link](../../specs/096-invite-code-or-link.md)

## Bugs

- [x] **Short invite code does not join the host (2026-09-27)** — a short code was still shown when signalling never stored it (the host page kept one in memory, or regenerate returned a token with no code). The link kept working because the host was already watching that token, and the joiner's lookup missed. The dialog now shows a code only after the shared signalling store confirms it, and `?invite=` resolves a short code the same way as the join field.
  - Spec: [Invite code or link](../../specs/096-invite-code-or-link.md)

- [x] **Invite code field matches the link field (2026-09-26)** — the host dialog code input used an unstyled class, so it kept the browser's white background. It now shares the link field's class and styles: background, border, radius, font, padding, height, and copy-button alignment.
  - Spec: [Invite code or link](../../specs/096-invite-code-or-link.md)

- [x] **Preview link and short-code joins look dead without TURN (2026-09-27)** — on the #717 deploy preview, neither the full invite link nor the short code connected for a tester who has no TURN env vars on Netlify. WebRTC session, remote connection, ICE config, TURN credential minting, and the service worker were unchanged versus main. Preview and production `GET /api/signalling/ice-servers` both return Google STUN only with `turnConfigured: false`. Missing TURN env does not throw, and Blobs still store offers, answers, and invite codes. Two browser contexts on that preview connected by the full link and by the short code with no extra setup. Same-computer play still uses public STUN. A phone or another network still needs the existing TURN variables; this change does not add a new secret.
  - Spec: [Cross-device WebRTC join](../../specs/072-cross-device-webrtc-join.md)

## Documentation note

The multiplayer join field accepts a full invite URL, the 6-character invite code (`ABC-DEF`), or the long token. The code is case-insensitive and ignores spaces and dashes. The signalling server maps each party's code to that invite's long token until the invite expires. Other text shows a validation error. Offline mode (spec 095) still disables joining; the invite code and link fields stay visible.
