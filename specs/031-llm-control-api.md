# LLM Control API Specification

## Overview
This specification introduces a versioned **LLM Control API** for deterministic RTS automation. The game exports a compact strategic snapshot each strategic tick and consumes explicit action lists from the LLM. The protocol is implemented as TypeScript types, JSON Schema, and runtime validators.

## Goals
- Provide a single source of truth for input/output payloads (`protocol.ts`, `protocol.schema.json`, `validate.js`).
- Export a deterministic snapshot + transition log since the last strategic tick.
- Apply explicit, safe actions without runtime ambiguity or script execution.
- Support forward/backward compatibility through strict protocol versioning.

## Protocol
### Versioning
- `protocolVersion` currently: `1.0`.
- Payloads with unsupported versions are rejected.

### Input (`GameTickInput`)
- `meta`: map dimensions, tile size, coordinate system, fog-of-war flag, and catalog version.
- `snapshot`: resources, units, buildings, build queues, and optional map summary data.
- `transitions`: time-ordered events since the last strategic tick (unit/building creation, damage, destroyed, etc.).
- `constraints`: action limits for the tick and queueing capabilities.

### Output (`GameTickOutput`)
Actions are a strict discriminated union:
- `build_place`
- `build_queue`
- `unit_command`
- `set_rally`
- `cancel` (reserved)
- `ability` (reserved)

All actions require a unique `actionId` to enable idempotency and debugging.

## Transition Collection
Event collection is recorded in the following systems:
- Unit spawns and building placement/completion.
- Damage from bullets, explosions, and mines.
- Destruction during unit/building/factory cleanup loops.

## Engine Integration
- `exportGameTickInput(state, sinceTick, options)` builds an input payload from game state plus transition events.
- Strategic LLM requests no longer embed the raw `GameTickInput` snapshot directly. They derive a compact `inputMode: compact-strategic-v1` digest for prompting that keeps the output contract unchanged while reducing prompt size.
- The compact strategic digest contains grouped friendly forces, condensed owned-building state, visible enemy force summaries, priority target ids, compact map/base intel, LLM queue state, recent delta highlights, and action constraints.
- `applyGameTickOutput(state, output)` validates and applies actions, returning accepted/rejected action lists.
- Invalid actions are rejected with structured reason codes (e.g. `INVALID_SCHEMA`, `UNKNOWN_ENTITY`).
- OpenAI calls use the `/v1/responses` endpoint with a lightweight `GameTickOutput` schema (protocolVersion, tick, actions, intent, confidence, notes all required) to satisfy provider strict `json_schema` validation; full protocol validation still happens locally.

## Tests
- Unit tests validate the example payloads and applier behaviors for building placement, production, and unit commands.
- Example payload validation is snapshot-tested.

## Examples
Two paired input/output examples are stored in `src/ai-api/examples/`:
- `early-game-input.json` + `early-game-output.json`
- `combat-input.json` + `combat-output.json`
