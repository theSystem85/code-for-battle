# Live module hot swap

## Scope

On the `dev` branch deploy, a commit explicitly marked `Live-Update: safe` may replace JavaScript without reloading when every changed JavaScript module is registered as swappable and the non-swappable bundle signature is unchanged. Network games with another connected human remain deferred; local games against AI remain eligible.

The initial registry contains the live-update HUD notice helper. New modules must be deliberately added to `LIVE_MODULES` and the client registry, export `hotSwappable = true`, and may implement synchronous `hotDispose()` and `hotAccept(previousState)` hooks.

## Lifecycle

1. Poll and validate the new manifest.
2. Download every changed registered module without activating it.
3. At the start of an animation frame, before simulation ticks, call `migrateLiveState(state, fromVersion, toVersion)`.
4. Swap registry implementations and hand module-local state from `hotDispose` to `hotAccept`.
5. If import, validation, migration, disposal, or acceptance fails, restore installed modules and offer the existing consent-based save/reload/restore path.

Migrations must preserve the root game-state object so existing references remain valid. A schema transition without a migration throws and falls back to reload.

## Performance assessment

The safe-point hook runs once per animation frame (75 calls/second at the required floor), independent of entity count and DPR. Its idle path is one function call and one null check returning a shared frozen result; it performs no allocation and no entity scans. Module imports and validation occur in the 20-second polling path, not in a tick. No rendering work, canvas pixels, or asset preparation changed. A qualifying-hardware 75 FPS certification remains required because this environment cannot certify presented display FPS.
