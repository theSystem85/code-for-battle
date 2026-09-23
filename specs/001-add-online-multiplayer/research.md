# Research: Online Multiplayer Takeover

## Signalling & STUN strategy
- **Decision**: Run a minimal Express.js helper under `/server/stun.js` that accepts REST POSTs for `offer`, `answer`, and `ice-candidate`, relays them to the host, and issues unique invite tokens per game-instance+party instead of adding a full TURN service.
- **Rationale**: The user explicitly requests an Express-based STUN/signal helper; WebRTC requires at least one server for offer/answer exchange, and keeping it REST-based keeps the service tiny and testable while respecting the "no gaming server" intent.
- **Alternatives considered**: WebSocket-based signalling (adds persistent sockets and more complexity), direct third-party signalling (breaks offline/offsite requirements). A TURN relay was deferred here and is now required for cross-device joins; see `specs/072-cross-device-webrtc-join.md`.

## WebRTC ownership/AI fallback flow
- **Decision**: Treat the host browser as the authoritative source-of-truth; when a remote peer joins, pause the AI control loop, sync party metadata via DataChannel, and immediately resume AI once the peer disconnects, keeping the invite token valid for reuse on the same game instance.
- **Rationale**: This fulfills the spec requirements for host authority, instant AI fallback, and reusable invite links without adding extra servers or delegating control.
- **Alternatives considered**: Peer-to-peer master election (too complex and risks split-brain), server-moderated command ordering (requires heavier infrastructure and would violate the "host as source of truth" rule).
