# 2026-09-29 — F22 re-attack egress

## Bug

- [x] **F22 circles the target after a strike and neither re-attacks nor returns** — the combat orbit never left weapon range, nose-on steering collapsed the turn inside the minimum firing distance, and clamping the destination dropped combat mode so the return check could not see the attack. After each pass the jet now egresses by at least two turn radii past weapon range, keeps the rest of the volley for the next run, and still returns when ammo is empty or the target is gone.
  - Spec: [F22 re-attack egress](../../specs/098-f22-reattack-egress.md)
