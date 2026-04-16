# 2026-04-16T13:32:21Z UTC
Processed by: GitHub Copilot

in the SSE ensure there is a new select to determine the transparency/blending method to be used. The values are "black" and "alpha". When alpha is set each frame of that specific sprite sheet will be just added on top because the transparent background comes from native alpha channel of the image source (similar to how units are currently rendered on the map). When "black" is chosen then it will be rendered like animation sprites are currently rendered already (but also apply this to normal non animated map sprite assets).

with that implemented ensure the current rocks sprite sheet works by default (when "use integrated sprite sheet tile rendering" is checked (rename it to "custom sprite sheets")) with black background to be blended on the map without any visible black halos left.

Ensure that when  custom sprite sheets are enabled that when no water tiles are tagged that the default procedural water is still shown correctly (currently it looks broken but only when custom sprites are on).
