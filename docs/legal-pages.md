# Legal pages setup

## Local config file (not committed)
Create this file locally in the project root:

- `impressum.config.json`

You can start by copying:

- `src/legal/legalConfig.example.json`

Then replace all placeholder owner/contact/legal fields with your real values.

## Netlify deployment config
For Git-based Netlify deploys, the gitignored local file is not uploaded automatically. The build now generates `dist/impressum.config.json` in this order:

1. `IMPRESSUM_CONFIG_JSON` from the build environment
2. local root `impressum.config.json`
3. runtime fallback to `src/legal/legalConfig.example.json`

If you use Netlify environment variables, set `IMPRESSUM_CONFIG_JSON` to the full JSON content of your legal config. The build accepts both of these forms:

- a JSON object string, for example `{\"fullName\":\"Max Mustermann\"}`
- a JSON string containing that object, which will be parsed a second time automatically

Recommended Netlify setup:

- Site configuration -> Environment variables
- Add `IMPRESSUM_CONFIG_JSON`
- Paste the complete legal config JSON into the value
- Trigger a new deploy

## Fields to update
Update these keys in your local config:

- `fullName`
- `businessName`
- `addressLine1` (optional extra postal line, e.g. `c/o ...`)
- `street`
- `houseNumber`
- `postalCode`
- `city`
- `country`
- `email`
- `phone`
- `website`
- `vatId` (optional; leave empty to hide)
- `responsiblePerson` (optional; leave empty to hide)
- `privacyEmail`
- `representative` (optional)
- `hostingProviderName`
- `hostingProviderAddress`
- `lastUpdatedDe`
- `lastUpdatedEn`

## Routes
Legal pages are available at:

- `/impressum` (German legal notice)
- `/imprint` (English legal notice)
- `/datenschutz` (German privacy policy)
- `/privacy` (English privacy policy)
- `/kontakt` (German contact form)
- `/contact` (English contact form)

They are linked from:

- Sidebar footer links in-game
- The legal notice contact link when `contactFormUrl` is configured

## Privacy sections inferred from current codebase
The privacy text currently reflects observed technical behavior in the repository:

- Uses browser Local Storage extensively for settings, saves, replays, aliases, and configuration state
- Uses WebRTC for multiplayer peer connectivity
- Uses API/network requests for signaling and session coordination (including Netlify function endpoints)
- Uses Netlify Forms for the static contact forms
- Uses service worker and cache features for PWA/runtime behavior
- No explicit classic analytics script integration detected in source files

## Manual legal review recommended
Please review and adapt at minimum:

- Exact legal wording for your business type and publication context
- Whether any section should mention additional processors (CDN, email provider, etc.)
- Supervisory authority naming (if you want to include a specific authority)
- Third-party API/provider section if you enable additional providers or telemetry
