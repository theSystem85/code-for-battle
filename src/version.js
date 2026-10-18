// The version is computed at build time (vite.config.js `define`) from
// package.json plus features/unreleased/** entries. Never write a version here
// by hand; see scripts/versioning.mjs and the Deployment section of AGENTS.md.
// All builds, deploy previews included, show this plain version.
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
