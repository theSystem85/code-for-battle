# Legal pages setup

## Local config file (not committed)
Create this file locally in the project root:

- `impressum.config.json`

You can start by copying:

- `impressum.config.example.json`

Then replace all placeholder owner/contact/legal fields with your real values.

## Fields to update
Update these keys in your local config:

- `fullName`
- `businessName`
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

They are linked from:

- Sidebar footer links in-game
- A small persistent quick-links area in the website shell

## Privacy sections inferred from current codebase
The privacy text currently reflects observed technical behavior in the repository:

- Uses browser Local Storage extensively for settings, saves, replays, aliases, and configuration state
- Uses WebRTC for multiplayer peer connectivity
- Uses API/network requests for signaling and session coordination (including Netlify function endpoints)
- Uses service worker and cache features for PWA/runtime behavior
- No explicit classic analytics script integration detected in source files

## Manual legal review recommended
Please review and adapt at minimum:

- Exact legal wording for your business type and publication context
- Whether any section should mention additional processors (CDN, email provider, etc.)
- Supervisory authority naming (if you want to include a specific authority)
- Third-party API/provider section if you enable additional providers or telemetry
