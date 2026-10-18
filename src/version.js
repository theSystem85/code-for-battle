// The version is computed at build time (vite.config.js `define`) from
// package.json plus features/unreleased/** entries. Never write a version here
// by hand; see scripts/versioning.mjs and the Deployment section of AGENTS.md.
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

// Display label. Deploy previews append their pull request number
// (for example 0.62.1-pr757); everywhere else it equals APP_VERSION.
export const APP_VERSION_LABEL = typeof __APP_VERSION_LABEL__ === 'string' ? __APP_VERSION_LABEL__ : APP_VERSION
