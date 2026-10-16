# Prompt: city buildings placed 2x2 look ~1 tile

> (b) city buildings placed 2x2 look ~1 tile (sprite padding vs render) — fix so they fill their span

Finding: the cause was sprite padding (the art filled about 55-75% of each rect), not the renderer. Fix: rescale the art in dtv3_city.webp to fill each span.
