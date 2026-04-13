# Spec 056 — Legal Pages Setup (Impressum/Privacy, DE+EN)

## Goal
Provide production-ready legal pages for a public browser/PWA game with German operator context while keeping personal identity/address data out of git history.

## Scope
- Add routes/pages:
  - `/impressum`
  - `/imprint`
  - `/datenschutz`
  - `/privacy`
- Keep legal implementation files under `src/legal/` while preserving the existing public routes for dev and production builds.
- Render content from centralized config data loaded at runtime.
- Keep local identity/contact details in `impressum.config.json` (gitignored).
- Provide committed example placeholders in `src/legal/legalConfig.example.json`.
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
5. Public legal routes must keep working both in Vite dev mode and in built output after moving the implementation files under `src/legal/`.
6. Privacy text must explicitly cover legal bases, retention periods, third-country transfer wording for Netlify hosting/forms, and TLS transport encryption.
7. The imprint must include the chosen consumer-dispute wording when applicable.
8. Git-based deployments must be able to emit `dist/impressum.config.json` from an environment variable so the private legal config can be deployed without committing it.

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

## Follow-up adjustments
- 2026-04-01: Floating shell legal quick links must be hidden in mobile portrait condensed/collapsed modes and only remain visible when the sidebar is expanded.
- 2026-04-08: Remove the floating shell legal quick links element from the website shell; legal-page access remains available through the dedicated routes and existing in-game UI flows.
- 2026-04-09: Add `contactFormUrl` config field. Impressum/Imprint contact sections now render a contact form link when configured, satisfying the § 5 DDG second-contact-method requirement as an alternative to a phone number.
- 2026-04-09: Add bilingual Netlify Forms contact pages (`/contact`, `/kontakt`) with `data-netlify="true"`, honeypot spam filter, custom success pages (`/contact-success`, `/kontakt-erfolg`), and dark-theme form styles.
- 2026-04-09: Add `vite.config.js` with multi-page `rollupOptions.input` so all root HTML pages are included in `vite build` dist output (fixes legal pages not being deployed to production).
- 2026-04-10: Move all committed legal HTML/CSS/example-config implementation files into `src/legal/`. Vite now rewrites the existing dev routes to the moved source pages and relocates the built legal HTML files back to `dist/` root so public URLs remain unchanged.
- 2026-04-10: Complete the remaining legal disclosure updates for the current operator choices: split the `c/o` address into its own postal line, add the consumer-dispute statement, and extend the privacy policy with legal bases, Netlify Forms disclosure, retention periods, third-country transfer wording, and TLS information.
- 2026-04-10: `npm run build` now writes `dist/impressum.config.json` from `IMPRESSUM_CONFIG_JSON` when available and otherwise falls back to the local gitignored root file. This keeps Git-based Netlify deploys compatible with the private legal config.
- 2026-04-13: Remove the legal-page "Back to game" header links from all legal/contact entry pages because these routes are commonly opened in their own tab and the link suggested a misleading tab-navigation behavior.
