# 046 - Building Selection Should Not Issue Move Commands

## Summary
When only buildings are selected, clicking on the map must not attempt unit movement/pathfinding.

## Requirements
- Mouse standard command handling must ignore building selections for movement/attack command routing.
- If the selection contains only buildings (or non-movable entities), command dispatch should return early.
- This prevents unreachable-move notifications that are only meaningful for movable units.

## Validation
- Unit test coverage should assert that `handleStandardCommands` does not call movement/attack command handlers when only a building is selected.
