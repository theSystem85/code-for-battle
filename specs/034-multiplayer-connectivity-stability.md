# Spec 034: Multiplayer Connectivity Stability & Responsive Pause Recovery

## Goals
- Improve multiplayer resiliency when a remote human client experiences packet loss, high jitter, or short disconnects.
- Pause simulation for all participants when a remote party becomes unresponsive.
- Show an unresponsiveness timer to host and all clients while reconnect is pending.
- Delay AI takeover to give reconnect a fair grace period.
- Keep compatibility with 2-4 player matches and mixed AI/human constellations.

## Implemented behavior
1. **Heartbeat monitoring**
   - Host sends periodic `heartbeat-ping` messages over data channels.
   - Clients answer with `heartbeat-pong` immediately.
   - Host marks a session unresponsive when no response is seen within timeout.

2. **Forced pause while reconnecting**
   - If any connected remote party is unresponsive, host forces `gamePaused = true`.
   - Pause state is propagated through regular host status payloads.
   - Pause is released automatically if all unresponsive parties recover and the game was not paused before forced pause.

3. **Unresponsive timer visibility**
   - Host-side party row displays `Reconnecting MM:SS` for affected party.
   - Client-side top banner shows `alias is reconnecting (MM:SS)`.

4. **Delayed AI takeover fallback**
   - AI takeover is delayed by a reconnect grace window (30s).
   - If reconnect fails after grace window, host returns the party to AI control and emits AI reactivation event.

5. **2-4 player support expectations**
   - Party state model preserves per-party responsiveness metadata.
   - Reconnect handling is party-local and does not assume fixed party count beyond configured 2-4 bounds.

6. **Kick removes reconnect state**
   - Host kick marks the session kicked before the data channel and peer connection close.
   - The later disconnect must not set `unresponsiveSince` or show `Reconnecting`.
   - A kick clears an existing reconnect timer and releases a network pause that the drop started.

## Non-goals
- No dev server/runtime orchestration changes.
- No direct network transport replacement (WebRTC remains transport).

## Validation strategy
- Unit tests for host pause + resume on heartbeat recovery.
- Existing multiplayer store/player count tests continue validating 2-4 party initialization behavior.
- Ensure host startup map settings can be injected through URL query params (`size`, `width`, `height`, `players`, `seed`) as temporary runtime overrides that dominate localStorage without persisting new localStorage values.
- Add Playwright Netlify-dev E2E coverage for a 4-party session (host + 2 remote humans + 1 AI) on a 40x40 map (seed 4) where the host explicitly sets 4 players, pauses immediately, minimizes tutorial, shares invite URLs, and only resumes once RED and YELLOW human joins are connected while BLUE remains AI.
- E2E test must pass `baseURL` to each `browser.newContext()` since Playwright does NOT inherit `config.use.baseURL` for manually created contexts; clients navigate directly to the invite URL (equivalent to paste-into-inviteLinkInput + click Join, which redirects to the same `/?invite=TOKEN` URL).
- Run that flow with 3 opened browser windows (host, RED remote, YELLOW remote); BLUE stays AI under host simulation and does not require a separate client window.
- Ensure host is paused immediately after startup in this flow so AI cannot execute autonomous early-game actions before invite/join synchronization.
- Ensure RED/YELLOW joining uses invite-link copy/paste behavior through the in-game join input and verify invite-link landing does not show tutorial UI.
- Ensure host-first sequencing: RED invite is generated/copied before RED browser starts; YELLOW browser starts only after YELLOW invite is generated/copied.
- Ensure join path is paste-first (`#inviteLinkInput` + `#joinInviteLinkBtn`) with fallback to direct invite URL navigation if paste-triggered redirect fails in headed runs.
- Optimize run speed by allowing RED/YELLOW clients to open directly via invite URL (`/?invite=...`) once copied/generated, avoiding an extra home-load + sidebar-paste cycle per client.
- Keep invite QR modal explicitly closed after each invite generation so subsequent invite buttons remain clickable.
- Explicitly close/dismiss host invite modal after YELLOW invite/join flow before proceeding to provisioning and combat checks.
- In headed Chromium runs, position host/red/yellow windows using CDP `Browser.setWindowBounds` to reduce overlap during visual debugging.
- Runner should detect the largest host display when possible (macOS display probe) and feed those dimensions into test window layout so all participant windows are placed on that largest available screen.
- For stable headed placement across multiple monitors, run HOST/RED/YELLOW in separate browser processes (not only separate contexts of one browser), since CDP window-bounds operations can otherwise target a shared native window and cause relocation.
- Ensure test explicitly expands `Map Settings` accordion and scrolls sidebar regions before interacting with hidden controls (`#playerCount`, invite buttons/inputs), to avoid visibility flakiness in headed runs.
- Emit timestamped verbose logs for each invite/join step (host map setup, invite clicks, copied-link capture, paste join, fallback path decisions) so failures can be diagnosed from CI/local console output.
- Current baseline parameters for this scenario: `seed=4`, `size=40`, `players=4`.
- Ensure invite-link flows used by remote clients keep tutorial UI hidden on invite landing and alias submission (`RED`, `YELLOW`) is reflected before gameplay assertions.
- Correct party-color mapping in the Netlify 4-party E2E: `player2=Red`, `player3=Blue`, `player4=Yellow`; invite RED and YELLOW, and keep BLUE AI-controlled.
- Ensure the Netlify multiplayer E2E demonstrates visible stack progression for each human-controlled party (HOST/RED/YELLOW) through normal production flow (power plant, ore refinery, vehicle factory, harvester, tank) and does not use direct unit/building spawn shortcuts for this validation.
- Ensure host pause discipline in Netlify multiplayer E2E: host pauses immediately after startup and remains paused through invite/join/setup until all remote parties are connected; resume occurs only after connection checks pass.
- During direct-invite joins, require client-side remote session `connected` state and host-side party state confirmation (`aiActive === false`) before continuing.
- While host simulation is paused, continue processing multiplayer/network command intake (without advancing simulation time) so invite-based connection handshakes can still complete.
- Ensure headed role windows and rendered game content dimensions stay aligned in multiplayer E2E (no viewport larger than native window) so visual debugging reflects true on-screen output.
- Launch headed multiplayer E2E role browsers with hardware acceleration defaults (prefer system Chrome channel, enable GPU/WebGL acceleration flags) so WebGL rendering uses GPU where available.
- Ensure HOST/RED/YELLOW begin and execute build progression concurrently after host resume (parallel stack build), not one party at a time.
- Add an extended multiplayer scenario that reuses the same setup/join/build flow and then scales each human party to a 2-tank stack through production UI, with immediate AGF-driven assaults into BLUE base targets whenever a tank is ready.
- Extended scenario completion must verify BLUE structure elimination only (buildings/factories, excluding walls), without requiring BLUE unit elimination or victory-screen assertion.
- AGF commands in this scenario must be issued host-authoritatively per human party (`player1`, `player2`, `player4`) so RED and YELLOW reliably attack, not only GREEN.
- AGF target set for this scenario must include BLUE structures only (buildings/factories) and ignore BLUE units.
- Extended scenario must issue AGF deterministically through programmatic engine-equivalent behavior (combat-unit selection state + AGF attack queue/targets), so in-game AGF target indicators visibly include all BLUE base structures, including construction yard, ore refinery, vehicle factory, and power plant.
- Provide a dedicated npm launch script for the extended multiplayer scenario (grep-based selection in runner) without duplicating runner code.
- Keep multiplayer economy host-authoritative: remote production/build commands must debit the corresponding party budget on host, and remote clients must not apply local-only money debits/refunds during production progress.
- Validate economy accounting after refinery unload by asserting HOST money and RED/YELLOW factory budgets increase following harvester delivery cycles.
- Validate post-join gameplay flow by confirming GREEN/RED/YELLOW controlled parties complete base progression (power, refinery, vehicle factory), produce at least two harvesters and one `tank_v1`, and initiate combat where all human tanks focus BLUE AI with projectile visibility across host and clients.
- Ensure GREEN/host party progression is asserted as strictly as RED/YELLOW (host must own construction yard, power plant, ore refinery, and vehicle factory before combat checks).
- Ensure this Netlify multiplayer Playwright flow runs in headed mode for visual debugging and includes deterministic test timeout + `finally` teardown cleanup so runs cannot remain pending indefinitely.
- Ensure multiplayer E2E command does not leave Playwright HTML report server running on `http://localhost:9323` (disable auto-open and perform explicit post-run port cleanup) to prevent agent-mode hangs.
- To reduce headed multi-window FPS degradation, launch each role browser with anti-throttling Chromium flags for background/occluded windows.
- For headed performance parity and stable CPU usage, keep default frame pacing (do not disable frame limit/vsync), cap role window sizes in multiplayer E2E, and make optional browser-channel/uncapped overrides env-controlled (`PLAYWRIGHT_BROWSER_CHANNEL`, `PLAYWRIGHT_UNCAPPED_RENDERING`).
