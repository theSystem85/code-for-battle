// The version is computed at build time (vite.config.js `define`) from
// package.json plus features/unreleased/** entries. Never write a version here
// by hand; see scripts/versioning.mjs and the Deployment section of AGENTS.md.
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

// Display label. Deploy previews show only their pull request label
// (for example PR758, no version number); everywhere else it equals APP_VERSION.
export const APP_VERSION_LABEL = typeof __APP_VERSION_LABEL__ === 'string' ? __APP_VERSION_LABEL__ : APP_VERSION

// Text for version displays: "v0.62.1" for versions, "PR758" for preview labels.
export function formatVersionDisplay(label = APP_VERSION_LABEL) {
  return /^\d/.test(label) ? `v${label}` : label
}
