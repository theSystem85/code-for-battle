- [x] **Bug: recover missing terrain during fast scrolling**
  Rebuild cached terrain after 2D context restoration, draw the complete terrain directly while a cached context is lost, invalidate released raster state, and protect all visible pages before cache allocations.
  Spec: [Terrain cache recovery](../../specs/terrain-cache-recovery.md)

Hardware acceptance remains pending: this environment has no `/dev/dri` hardware GPU. iPhone reproduction and 75 FPS acceptance must be checked on dev with qualifying hardware.
