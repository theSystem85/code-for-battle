# Feature Specification: Online Multiplayer Takeover

**Feature Branch**: `001-add-online-multiplayer`  
**Created**: 2025-11-24  
**Status**: Draft  
**Input**: User description: "Add online multiplayer support where humans can join an existing game and take over an AI party (during running or paused game). The interface should be minimalistic. In the sidebar below the "Players: " input there will be a label for each active party in the game like "Red: NameOfRedPlayer" and so on. Each row has another party listed with a small invite button on the right that generates an invite link to take over that party by a human player on the internet. When a human opens the link in a browser the game is started and the browser connects to that game and the party is taken over by that player. Before connecting the new player has to enter his name/alias. After that he will join immediately to the running or paused game of the host. Use WebRTC to connect the browsers directs to one another so no gaming server is needed. The host browser will serve as the source of truth when more than 2 players are joined. The host will get a notification when a player joined successfully. When a party disconnects (i.e., by closing the tab) the party will immediately be taken over by an AI player again but the invite link will work again if opened in a browser. The invite link is specific to a game instance and a party. Any party can save the game but when a non-host loads the game this non-host will be the new host and the game instance will be different and also the invite links will be different from the original. Only the host can start/pause the game or use cheats. For the initial WebRTC connection setup use a small express server for STUN."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Host invites remote player (Priority: P1)

The host creates a minimalistic invite for an AI party so a remote human can immediately replace it without leaving the running match.

**Why this priority**: Without the invite flow no human can ever take over an AI party, so delivering this in isolation already supplies tangible multiplayer value and lets testers verify remote control end to end.

**Independent Test**: The host clicks one of the party rows, copies the generated invite link, shares it to another browser, and confirms that the remote window joins the running match.

**Acceptance Scenarios**:

1. **Given** the sidebar renders each party row below the "Players:" input and shows an invite button, **When** the host triggers the button for one party, **Then** the UI displays a copyable link tied to that party and game instance while keeping the HUD minimal.
2. **Given** the link was sent to a remote browser, **When** the remote opens the link, enters an alias, and confirms, **Then** the remote game loads via WebRTC, the AI controller for that party is paused, and the host window receives a join notification.

---

### User Story 2 - Remote player joins running/paused match (Priority: P2)

A remote player should be able to name themselves, join a running or paused session instantly, and start issuing commands while the host remains the only person permitted to start/pause or trigger cheats.

**Why this priority**: The multiplayer experience must feel seamless whether the host is mid-battle or has paused; proving this ensures the connection is reliable and that host authority is respected.

**Independent Test**: The host keeps the match running or pauses it, the remote browser uses the invite, supplies an alias, and immediately gains control of the party while the host retains start/pause/cheat authority.

**Acceptance Scenarios**:

1. **Given** the host is mid-game (either running or paused) and has published an invite, **When** a remote connection completes the alias entry and WebRTC handshake, **Then** the remote UI reflects the current game state and the remote player sends commands that the host immediately sees in the authoritative view.
2. **Given** the host is sending commands, **When** the remote player issues unit orders, **Then** those orders appear as if issued locally and the host’s window continues to prohibit start/pause/cheat controls to non-hosts.

---

### User Story 3 - AI fallback and host handover (Priority: P3)

If a human player disconnects or a save is loaded by a non-host, the party must fall back to AI, invite links should be reusable (or regenerated for new hosts), and host leadership should transfer cleanly.

**Why this priority**: It closes the multiplayer lifecycle by ensuring parties do not break after disconnects, saves, or reloads, which keeps the experience reliable past the first join.

**Independent Test**: A remote player disconnects and then a new browser reuses the same link; later a non-host loads a save and becomes the new host.

**Acceptance Scenarios**:

1. **Given** a human-controlled party is active, **When** the remote browser tab closes or the WebRTC link drops, **Then** the AI immediately reclaims the party, and the invite link remains valid so the next browser can reclaim the party.
2. **Given** that any party saved the game while hosted by a non-host, **When** a different player loads that save, **Then** the loader becomes the new host, the invite links regenerate for the new game instance, and only that host can start/pause or use cheats.

---

### Edge Cases

- What happens when the Express STUN endpoint is unreachable? The host shows a compact warning, disables the invite buttons without cluttering the UI, and automatically retries the connection while retry counts are exposed to allow debugging.
- How does the system behave when the host completely exits? The invites expire, any remote sessions are cleanly torn down, and remaining players see a "host disconnected" message instead of continuing with stale state.
- What happens if multiple remote browsers open the same invite link at once? The first successful handshake takes control; subsequent browsers receive a polite busy notice until the party either reverts to AI or the current remote disconnects.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render a minimalistic party list below the existing "Players:" input where each row shows the party color, current owner label, and a compact invite button that never overlaps the canvas or other HUD elements.
- **FR-002**: System MUST generate a sharable invite link for each party that encodes the party ID and game instance ID, remains bound to that party until the host quits or loads a new instance, and is presented to the host without disrupting the battlefield view.
- **FR-003**: System MUST require remote players to enter an alias before joining, connect them directly via WebRTC (with the host as the authoritative source-of-truth whenever more than two players exist), and immediately stop the AI controller for that party.
- **FR-003a**: System MUST show the invite landing UI as soon as the remote browser opens the link and use the new `createRemoteConnection` helper so the alias submission immediately triggers the offer/answer handshake and ICE exchange.
- **FR-004**: System MUST include a lightweight Express-powered STUN/signaling endpoint that allows browsers to exchange offers/answers so the peer-to-peer WebRTC connection can be established without a persistent gaming server.
- **FR-005**: System MUST notify the host when a remote player successfully joins, so the host has visual confirmation while remaining eligible to start/pause or initiate cheats.
- **FR-006**: System MUST revert the party to AI control and keep the invite link valid for the same party/game instance within two seconds of a disconnect, allowing quick rejoining.
- **FR-007**: System MUST allow every party to save the game, but when a non-host loads a save the loader becomes the new host, invites refresh to the new instance, and start/pause/cheat controls move to that host exclusively.
- **FR-008**: System MUST provide an input field in the multiplayer/network section where users can paste a full invite link (URL with token or raw token) to connect to a game, enabling PWA users to join games without requiring URL parameter manipulation.
- **FR-009**: System MUST show each human party's alias above its construction yard (including the host's own label), update that label immediately when the alias field changes in the multiplayer sidebar, and persist/reload the host alias across sessions.

### Key Entities *(include if feature involves data)*

- **PartyState**: Represents a color-coded party entry with `{partyId, color, ownerType, avatarAlias, inviteToken, aiActive}` and drives the sidebar rows, button states, and AI takeover logic.
- **InviteLink**: Tracks `{gameInstanceId, partyId, token, createdAt, expiresOnHostExit}` so that links stay tied to the correct party, can be regenerated when a new host loads a save, and validate reconnection attempts.
- **WebRTCSession**: Manages signalling metadata per join attempt, including `{hostId, peerId, alias, connectionState, lastPing}`, allowing the Express STUN server to route offers/answers and the host to report joins/disconnects.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Hosts can generate an invite for every party and present it in under five seconds without hiding or shifting the core canvas.
- **SC-002**: Remote players can enter their alias, connect via the invite, and start issuing commands within fifteen seconds of opening the link; the host receives a join notification within three seconds and retains exclusive start/pause and cheat authority.
- **SC-003**: When a human-controlled party disconnects, the AI reclaims control within two seconds and the same invite link remains usable for the next browser session to reclaim the party.
- **SC-004**: Any party save loaded by a non-host elects that player as the new host, regenerates the invite links for the fresh instance, and strictly grants start/pause/cheat controls only to the current host.

## Implementation Plan (Live Work)

- Track the remaining User Story 3 work via tasks T016–T018 so the autop-run detection, invite regeneration, and host metadata sync remain visible to the team.
- T016: detect remote disconnects or WebRTC failures, flip `aiActive` on immediately, and keep the party’s invite token reusable while notifying the UI of the handoff.
- T017: when a non-host loads a save, call `/game-instance/:instanceId/invite-regenerate`, update the sidebar rows, and persist the loader as the new host in `multiplayerStore`.
- T018: ensure the new host is the only party allowed to start/pause/cheat after a load, and mirror the host/party metadata across `gameState` + `multiplayerSession` so future handovers stay consistent.

## Assumptions

- The existing sidebar can accommodate the new rows without a full redesign, and party colors/labels can be reused for clarity.
- The host environment can run a minimal Express STUN service that is reachable by invitees over the internet, either embedded in the same page or as a lightweight background worker.
