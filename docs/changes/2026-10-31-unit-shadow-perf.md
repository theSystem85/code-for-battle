- [x] **Reuse one baked ground shadow per unit type**
  Keep mask drawing, stretching, opacity, and blur out of the per-instance render path; repeated units now use the same prepared bitmap with precomputed draw offsets.
  Spec: [Unit ground shadows](../../specs/unit-shadows.md)
