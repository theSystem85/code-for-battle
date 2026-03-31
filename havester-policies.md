# Havester Policies

This document describes the full automated harvester policy after the 2026-03-31 audit and fix pass.

## Priority Order

1. Player-issued command ownership
2. Spawn/default automation
3. Preferred assigned refinery
4. Enemy-only retreat on attack
5. Long-term stagnation recovery

## Mermaid Overview

```mermaid
flowchart TD
    A[Harvester update tick] --> B{Enemy harvester retreating?}
    B -->|Yes| C[Retreat owns movement<br/>Clear ore + unload routing]
    C --> D{Safe again?}
    D -->|No| C
    D -->|Yes| E[Resume normal harvest loop]
    B -->|No| F{Player manual hold target?}
    F -->|Yes| G[Move to commanded tile]
    G --> H{Reached non-ore tile?}
    H -->|Yes| I[Stay idle until new player command]
    H -->|No| G
    F -->|No| J{Player manual ore target?}
    J -->|Yes| K[Move to chosen ore tile]
    K --> L{Reached ore tile?}
    L -->|Yes| M[Start harvesting]
    L -->|No| K
    J -->|No| N{Freshly spawned with no player override?}
    N -->|Yes| O[Find reachable ore target]
    O --> M
    N -->|No| P{Carrying ore?}
    P -->|Yes| Q[Route to preferred refinery]
    Q --> R{Adjacent + refinery free?}
    R -->|Yes| S[Unload ore]
    R -->|No| Q
    S --> T[Clear cargo]
    T --> O
    P -->|No| U{Standing on valid ore?}
    U -->|Yes| M
    U -->|No| V[Auto-find ore target]
    V --> K
    M --> W{Harvest complete?}
    W -->|No| M
    W -->|Yes| Q
    K --> X{>60s without progress to ore?}
    X -->|Yes| Y[Retarget pseudo-random reachable ore tile<br/>with similar preferred-refinery distance]
    Y --> K
    X -->|No| K
```

## Policy Details

- Player move to non-ore: interrupts active harvesting/unloading, travels to the requested tile, then holds position there.
- Player move to ore: interrupts active harvesting/unloading, travels to the requested ore tile, then starts normal automated harvesting and refinery unloading.
- Spawn behavior: new harvesters without a player override acquire a reachable ore target automatically.
- Preferred refinery: unload and stuck-unload recovery always prefer the harvester's assigned refinery when one exists.
- Enemy attack response: only enemy AI harvesters use the retreat branch; during retreat, economy routing is paused so movement ownership is not contested. AI retreats use path-based forward movement (not the player backward-movement retreat system). The post-retreat cooldown is always respected, even when threats are still visible.
- Long-term recovery: a route is only considered productive if the harvester is actually harvesting, unloading, or reducing distance to its goal. Mere possession of a path or move target does not count.
- Recovery target selection: reroutes choose a pseudo-random reachable ore tile from the best similarity shortlist so repeated loops do not keep picking the same trapped geometry.

## Root Causes Fixed

- The player tactical retreat system (`updateRetreatBehavior` in retreat.js) was running for AI harvester retreats. Its straight-line path-block check hit buildings near the retreat target, clearing `isRetreating` immediately and creating an infinite cancel-re-trigger loop.
- `shouldHarvesterSeekProtection` checked nearby threats before the post-retreat cooldown, so the 4-second cooldown was bypassed when threats were visible, causing immediate re-retreat.
- Manual ore targets could reach the ore tile and still sit idle because manual priority suppressed auto-harvest while the manual-target handler did not start harvesting on arrival.
- Normal player move commands did not establish a persistent non-ore hold state, so automation could take the harvester back over after the move completed.
- Productivity checks treated `path`/`moveTarget` as sufficient evidence of progress, which allowed blocked or looping harvesters to look “busy” forever.
- Stuck unload recovery could switch away from an assigned refinery, violating the intended refinery preference.
