# Unit ground shadows

## Intent

Units render a subtle, inexpensive oval below their sprite so their grounding matches the north-east-cast shadows baked into building art.

## Behaviour

- Shadows default to enabled and are cast north-east at 45 degrees.
- Graphics settings expose live controls for visibility, offset length (0–150% of a footprint), and direction (0–360 degrees).
- The settings persist in the existing graphics settings record.
- Aircraft use a smaller, lighter shadow; selection and status overlays remain above the sprite.

## Performance acceptance

Rendering adds one bounded ellipse per visible unit and no gradients, filters, offscreen surfaces, or per-unit retained state. Qualifying-hardware 75 FPS verification remains pending on Patrick's hardware because this environment has no verified hardware GPU.
