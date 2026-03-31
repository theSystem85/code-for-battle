# Spec 056 — Legal Pages Setup (Impressum/Privacy, DE+EN)

## Goal
Provide production-ready legal pages for a public browser/PWA game with German operator context while keeping personal identity/address data out of git history.

## Scope
- Add routes/pages:
  - `/impressum`
  - `/imprint`
  - `/datenschutz`
  - `/privacy`
- Render content from centralized config data loaded at runtime.
- Keep local identity/contact details in `impressum.config.json` (gitignored).
- Provide committed example placeholders in `impressum.config.example.json`.
- Ensure legal pages are discoverable:
  - from website shell
  - from in-game UI

## Functional requirements
1. App tries to load `impressum.config.json` first; if absent, falls back to example config; if both unavailable, use safe placeholders.
2. Optional sections render only when values exist:
   - VAT ID
   - responsible person for content
   - representative
3. Privacy text must reflect observed codebase behavior:
   - Local Storage usage
   - Multiplayer networking via WebRTC
   - API/signaling requests
   - No explicit classic analytics scripts found
4. Layout must be readable on desktop and mobile.

## Non-functional requirements
- No heavy dependency additions.
- Keep implementation minimal and maintainable.
- Do not commit real personal data.

## Documentation
Add developer-facing setup docs with:
- local config instructions
- route overview
- inferred privacy assumptions
- manual legal review checklist
