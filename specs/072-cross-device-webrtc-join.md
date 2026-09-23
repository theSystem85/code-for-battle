# Spec 072: Cross-device WebRTC joins

## Problem
Invite joins succeed when the host and the client are two browsers on the same computer, and fail when the client is another device (iPhone, iPad, or a client off the host LAN).

## Evidence
- Both peers were created with only `stun:stun.l.google.com:19302`. The Netlify site `code-for-battle` has no `TURN_URLS`, `TURN_SECRET`, `TURN_USERNAME`, or `TURN_CREDENTIAL` variables (the only env var is `IMPRESSUM_CONFIG_JSON`).
- Same-computer browsers can connect with host candidates, including loopback and mDNS names that resolve on that machine. Chrome and current Safari publish LAN addresses as `.local` mDNS candidates. Another device often cannot resolve those names, and many home routers do not hairpin a STUN server-reflexive public address back onto the LAN. Cellular and other NATs have no direct path without a TURN relay.
- The production service worker cached every same-origin GET, including `/api/signalling/*`. A cache hit can replay an empty lobby or a session that does not have an answer yet.
- Candidate writes used one shared blob with read-modify-write. Concurrent host and client posts could drop the only routable candidate. Same-computer joins still succeed if any host candidate survives.
- iOS WebKit can leave `connectionState` at `connecting` after ICE is `connected` or the data channel is open. Command send and the host "human joined" transition waited on `connectionState`.
- Netlify's available API does not expose function logs, so older failed joins could not be reconstructed. Player aliases stay in the session blob for the host UI and are not written to function logs.
- Audited against current `main`: `RemoteConnection.remoteCandidateIndex` and `HostSession.candidateCursor` are both initialized to `0` (client cursor since the original multiplayer commit). An undefined cursor would make `undefined < length` false and skip `addIceCandidate`. Both scans now reset a missing cursor to `0` before reading. That was not the cross-device failure; STUN-only still is.

## Behavior
1. On connect, the browser requests `GET /api/signalling/ice-servers` (and the local `server/stun.js` helper exposes the same route).
2. The response always includes Google STUN (`stun.l.google.com` and `stun1.l.google.com`). TURN is added when configured:
   - `ICE_SERVERS` is a JSON array of RTCIceServer objects, or `{ "iceServers": [...] }`. Entries that are not `stun:`/`stuns:`/`turn:`/`turns:` are dropped.
   - `TURN_SECRET` mints a 12-hour coturn `static-auth-secret` username (`<unix-expiry>:cfb`) and base64 HMAC-SHA1 credential when `TURN_URLS` is set and `ICE_SERVERS` did not already include TURN credentials.
   - Otherwise `TURN_USERNAME` and `TURN_CREDENTIAL` are passed through with `TURN_URLS`.
   - `VITE_ICE_SERVERS`, or `VITE_TURN_URLS` plus `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL`, are a build-time fallback used only when that request fails. Prefer the function env so secrets are not baked into the client bundle.
3. The offer and answer wait up to 4 seconds for ICE gathering, then post `localDescription`, so candidates gathered during that window are in the SDP even if trickle events are late. Later candidates still trickle.
4. Each candidate is stored in its own blob. Pending and session reads list those blobs and still accept the previous combined blob.
5. The client applies an answer only when `answerRevision` matches the current offer. A failed ICE transport restarts once and posts the next revision. The host answers that new offer.
6. `iceConnectionState` of `connected` or `completed`, and data-channel `open`, count as connected on both sides.
7. While the page is visible again (`visibilitychange` / `pageshow`), the current poll runs immediately so a phone that was backgrounded does not wait for the next throttled timer.
8. Logs use candidate type, protocol, mDNS, and private/loopback flags. They do not include player aliases, IP addresses, the TURN secret, usernames, or credentials. The alias stays in the signalling blob so the host UI can show who joined. The join overlay shows live ICE state while connecting (`ICE checking, connection connecting`) and, on failure, the TURN hint plus the ICE state (`ICE failed`).
9. Invite URLs are built from `window.location.origin` at the moment the link is created. The QR modal warns when that origin is localhost/loopback or not HTTPS, because a phone cannot complete WebRTC from those pages. Production invites are not rewritten to a hardcoded host.
10. `/api/*` and `/.netlify/functions/*` bypass the service worker cache. The cache name is `code-for-battle-cache-v2` so previously cached API responses are dropped.

## TURN setup
Set these on the Netlify site for Functions, including production and deploy previews. See the README for Metered.ca, Twilio Network Traversal, and Cloudflare Realtime. Copy the provider's `iceServers` JSON into `ICE_SERVERS`, or use the dedicated TURN variables. Do not commit real credentials. Metered Open Relay, Twilio, and Cloudflare credentials are often short-lived; refresh `ICE_SERVERS` when they expire. Coturn with `TURN_SECRET` mints a 12-hour credential on each ice-servers request.

```
ICE_SERVERS=[{"urls":["turns:turn.example.com:443?transport=tcp"],"username":"<dashboard>","credential":"<dashboard>"}]
```

or:

```
TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:443?transport=tcp
TURN_SECRET=<same value as coturn static-auth-secret>
```

`turns:` on port 443 is the path that works for iOS Safari, iCloud Private Relay, and mobile networks that block UDP.

The local helper reads the same variable names from the process environment.

## Verification
1. Deploy this branch and set the TURN variables above. Open the browser network panel on the phone and confirm `GET /api/signalling/ice-servers` returns `turnConfigured: true` and a `turns:` URL. Do not copy the credential into chat logs.
2. Mac host on `https://code-for-battle.netlify.app`, iPhone client, iPad client, all on the same Wi-Fi. The QR link must be that HTTPS origin (the modal warns if it is localhost or http). Each phone submits its alias from the invite link. While connecting, the phone shows an ICE state such as `ICE checking`. The host notification names the alias, and both phones leave the connecting screen.
3. Repeat with one client on cellular (Wi-Fi off). The join should still complete. Netlify function logs for `signalling` `candidate` events should include `"type":"relay"` and must not include the player alias or a candidate IP.
4. Without TURN variables, a same-computer two-browser join still works. A phone join should fail with the on-screen hint that no TURN server is configured, including `ICE failed` or the last ICE state, and the host log should show `relay: 0` without the player name.

## Performance
This change does not run on the simulation tick, animation frame, or entity render path. ICE config is fetched once per connection and cached for five minutes. Signalling polls every second only while a lobby is open. No FPS benchmark is required for this network path. `netlify.toml` still uses `npm ci --include=dev`.
