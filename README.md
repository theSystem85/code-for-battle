# Code for Battle

Code for Battle is a 2D, tile-based RTS game built with vanilla JavaScript and Canvas with WebGL (WebGPU also coming soon!).

## 🎯 Purpose

This project started in December 2024 as an experiment and benchmark: can frontier LLMs 0-shot a complex RTS game from prompt-driven development.

Over time, that benchmark evolved into a full RTS game. The long-term vision is to support LLM-controlled AI players and provide a built-in, user-friendly programming workflow so players can automate unit behavior and strategy (TBD).

The project is fully vibe coded.

## 🖼️ Screenshots

<p align="center">
	<img
		src="./public/images/docs/GamePlayDesktop(FEB2026).webp"
		alt="Code for Battle gameplay on desktop"
		width="900"
	/>
</p>

<table>
	<tr>
		<td width="60%" valign="top">
			<strong>Mobile (Landscape)</strong><br />
			<img
				src="./public/images/docs/GamePlayLandscape(FEB2026).webp"
				alt="Code for Battle gameplay on mobile in landscape"
				width="520"
			/>
		</td>
		<td width="40%" valign="top">
			<strong>Mobile (Portrait)</strong><br />
			<img
				src="./public/images/docs/GamePlayPortrait(FEB2026).webp"
				alt="Code for Battle gameplay on mobile in portrait"
				width="260"
			/>
		</td>
	</tr>
</table>

## 🚀 Install and Run Locally

### ✅ Prerequisites

- Node.js 20+
- npm 10+

### 📦 Setup

```bash
npm install
```

### 🕹️ Start the game (local development)

```bash
npm run dev
```

The app will be available at the local URL shown by Vite in your terminal.

### 🌐 Optional multiplayer signalling helper

For invite-based WebRTC multiplayer testing, run the signalling helper in a second terminal:

```bash
npm run stun
```

Cross-device joins (iPhone, iPad, or a client on another network) need a TURN relay in addition to STUN. Same-computer browsers can connect with host candidates alone. Set these variables for Netlify Functions (production, deploy previews, and branch deploys) or in the environment of `npm run stun`:

- `TURN_URLS` — comma-separated `turn:` and `turns:` URLs. Include TCP and `turns:` on port 443 so iOS Safari and cellular networks can connect.
- `TURN_SECRET` — coturn `static-auth-secret` / `use-auth-secret`. The signalling API mints a 12-hour username (`<expiry>:cfb`) and HMAC-SHA1 credential and does not log the secret.
- Or, instead of `TURN_SECRET`, set `TURN_USERNAME` and `TURN_CREDENTIAL` for a provider that issues a static username and password.

The browser asks `GET /api/signalling/ice-servers` when a peer connection starts. Function logs include the player alias and candidate type (`host`, `srflx`, `relay`, mDNS) without IP addresses, usernames, or credentials. A join that only gathered mDNS host candidates and `relay: 0` cannot reach another device until TURN is configured.

### 🧪 Optional Netlify local multiplayer test

If Netlify CLI is installed globally, you can run a local Netlify environment for multiplayer/signalling endpoints:

```bash
netlify dev
```

## 📘 How to Play

User documentation and gameplay reference:

- [In-game and gameplay documentation](./Documentation.md)
- [Spec 032: In-Game User Documentation](./specs/032-user-documentation.md)

## 🏗️ Architecture Documentation

Technical and architecture-focused documentation:

- [Architecture diagram and technical notes](./AI_Docs/ARCHITECTURE_DIAGRAM.md)
- [Multiplayer architecture spec](./specs/001-add-online-multiplayer/)
- [State sync architecture notes](./specs/state-sync-module.md)

## 🗂️ Legacy README

The previous README has been preserved at:

- [README.legacy.md](./README.legacy.md)

## 📄 License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
