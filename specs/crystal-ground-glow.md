# Crystal ground glow

Render a soft, animated light pool between terrain and each crystal sprite. The pool matches the blue ore or red seed-crystal family, grows brighter and larger with density, and occasionally twinkles using a deterministic low-frequency schedule. Cache the bounded set of glow rasters, cull through the existing visible-tile traversal, and bypass all glow work while the Graphics toggle is disabled.

The setting defaults on and is stored in the existing graphics-settings record without changing any previously saved values. Hardware-GPU performance acceptance at 75 FPS remains pending on the `dev` deployment because this environment has no verified hardware GPU.
