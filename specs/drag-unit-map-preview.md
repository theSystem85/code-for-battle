# Unit drag map preview

Dragging a production unit over the map displays its map sprite under the
pointer. Tanks use their separate wagon, turret, and barrel layers. Mouse and
touch drags share the preview. Release, drop, cancellation, leaving the map, and
window blur hide it. The preview never intercepts input or issues commands.

The bounded set of 24 unit previews is constructed at control initialization.
Pointer events move one 48px DOM overlay, independent of entity count and DPR;
no simulation or canvas render loop is added. Hardware acceptance of the 75 FPS
gate is pending on Patrick's GPU; no software GPU benchmark was run.
