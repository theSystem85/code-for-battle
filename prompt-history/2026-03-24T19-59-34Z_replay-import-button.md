# Replay Import Button

**UTC Timestamp:** 2026-03-24T19:59:34Z  
**LLM:** Copilot (GPT-5.4)

## Prompt

> ensure the save game import button can also be used to import an exported replay. Rename the tooltip of that button to "Import save game or replay"

## Summary of Changes

- Routed the existing Save/Load import button through a shared JSON import path that now detects save files versus replay exports.
- Added replay import normalization/storage so exported replay JSON can be re-imported into local replay storage.
- Refreshed the save list or replay list as needed after import, and auto-loaded a single imported replay just like single imported saves already auto-load.
- Renamed the import button tooltip and file input aria-label to "Import save game or replay".
- Updated the related TODO/spec entries to capture the shared import behavior.