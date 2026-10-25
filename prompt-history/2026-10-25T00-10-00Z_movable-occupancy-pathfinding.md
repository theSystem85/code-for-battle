UTC: 2026-10-25T00:10:00Z
Model: grok-4.7 (Cursor Cloud Agent harness). Took about 17m. Token counts unavailable.

User request:

Fix unit pathfinding so dynamically moving and movable objects do not obstruct pathfinding. Units should keep the shortest path. Other units and wrecks must not be hard blockers; contact physics pushes them aside. Buildings and other non-movable blockers must still block pathfinding. Extend occupancy tags to distinguish movable and non-movable occupancy. Paint movable occupancy tiles orange on the occupancy overlay. Push the finished fix straight onto `dev` after rebasing onto latest `origin/dev`. Do not open a pull request. Do not touch `main`.
