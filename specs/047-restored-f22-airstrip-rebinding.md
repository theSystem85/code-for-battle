# Spec 047: Restored F22 airstrip rebinding

## Problem
Restored F22 units can exist without a persisted `airstripId` (for example from workshop restoration paths), and then cannot complete landing because runway data resolution requires an assigned airstrip.

## Requirements
- When F22 runway data is required and `airstripId` is missing, the game must select a valid fallback airstrip.
- The fallback selection must target a **friendly**, **alive** (`health > 0`) `airstrip` building.
- If multiple friendly airstrips exist, choose the nearest one to the F22 position.
- Rebinding must also set `helipadTargetId` when absent, so landing/refuel flows remain coherent.
- Existing behavior must be unchanged when `airstripId` is already valid.

## Validation
- Add an E2E that simulates an airborne F22 with missing `airstripId` and active landing request.
- Verify the unit successfully binds to an airstrip, enters runway landing sequence, and reaches parked grounded state on that airstrip.
