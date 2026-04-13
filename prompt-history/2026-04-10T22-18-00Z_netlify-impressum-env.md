# 2026-04-10T22:18:00Z
## LLM: copilot

Change the build so Netlify can provide `IMPRESSUM_CONFIG_JSON` via environment variable. During build, parse that value as JSON (including the case where the variable contains a JSON string wrapping the object) and generate `dist/impressum.config.json` so the deployed legal pages use the private config instead of the committed example fallback.