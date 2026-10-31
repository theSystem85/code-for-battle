# Automation `.cfbl` import and export

## Purpose
Players can move automation state-machine definitions between browsers and share multiple definitions in one recognizable file.

## File contract
A `.cfbl` file is UTF-8 JSON with `type: "code-for-battle.automations"`, `version: 1`, and a non-empty `automations` array. Each item contains a display `name`, canonical CFBL `source`, and its global `enabled` state. Runtime bindings and match state are intentionally excluded.

## User experience
The left sidebar includes an Automations accordion immediately after Save/Load. It lists the policy store's current entries, mirrors global enablement, selects definitions for joined-name group export, exports all definitions, and imports one or more files. Invalid files show a notification. Every colliding display name asks whether to replace the existing definition, keep a suffixed copy, or skip that imported definition.

Downloads use slugified display names, keep a short portion of every name for a group, and cap the basename at 52 characters.

## Acceptance
- Store changes update both the sidebar and existing automation dialog through the existing subscription.
- Imports use the store save/enable operations and therefore existing persistence and multiplayer mutation behavior.
- File magic, version, shape, conflict behavior, and filename generation have focused unit coverage.
- Hardware 75 FPS acceptance is pending on Patrick's qualifying GPU; this event-driven UI adds no simulation-frame work.
