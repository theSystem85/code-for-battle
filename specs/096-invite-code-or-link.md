# 096 — Invite code or link

## Requirements

The multiplayer join field accepts three inputs. The field label, placeholder, and accessible name are `Invite code or link` / `Einladungscode oder Link`.

1. A full invite URL from any origin, with or without a trailing slash, extra query parameters, or a hash. The long token is the `invite` query parameter, or the same parameter in the hash when the query has none.
2. The long invite token pasted on its own.
3. A short code that belongs to one party. It is 6 characters (accepted up to 10) from an unambiguous alphabet of uppercase letters and digits without 0/O and 1/I/L. The host dialog shows it grouped, for example `ABC-DEF`, with its own copy button. The code field uses the same styles as the invitation link field: background, border, radius, font, padding, height, and copy-button alignment.

The link keeps the long token. Short-code entry is case-insensitive and ignores spaces, ASCII hyphens, and unicode dashes. The signalling store maps each active short code to that invite's long token, regenerates on collision with another active invite, and expires the code together with the invite. The host shows a short code only after the store confirms that a lookup of that code returns the same long token. A code kept only in the host page is not shown. Opening `?invite=` with a short code resolves it the same way as the join field.

Input that is none of those three forms shows a validation error and does not navigate. A code that is missing or expired shows "That invite code was not found or has expired."

Offline mode still disables multiplayer. While effectively offline, the join field, a short code already in `?invite=`, and the invite landing submit all report that multiplayer is unavailable and do not connect. The invite code and link controls stay in the dialog.

## Signalling

`POST /api/game-instance/:id/invite-regenerate` returns `{ inviteToken, shortCode, expiresAt }` when the code was stored. `GET /api/signalling/invite-code/:code` resolves a normalized code to that token. `POST /api/signalling/invite-code` stores a code for a token the host already has. `DELETE /api/signalling/invite-code` releases it. The mapping uses the same Netlify Blobs store as offers and answers (`signalling-sessions`). The local `server/stun.js` helper exposes the same routes. Contract details stay in `specs/001-add-online-multiplayer/contracts/multiplayer-api.yaml`.

Same-computer joins use public Google STUN when no TURN env vars are set. Cross-device joins still follow spec 072.
