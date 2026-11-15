- [x] **Art: radar station map sprite redrawn to match the build icon**
  The radar station on the map is now the white bunker with a cylindrical tower and a spherical radome, as shown on its sidebar build button, instead of the old satellite dish on a stone block. It has a transparent background and a soft ground shadow like its neighbours.

`public/images/map/buildings/radar_station.webp` (192×192, drawn into the 2×2 footprint) was replaced and the prepared 1x/2x/3x sprites and `sprite-manifest.json` were regenerated with `npm run make:prepared-sprites`. The previous sprite is kept as `public/images/map/buildings/originals/radar_station_old.webp` and the full-resolution cutout as `originals/radar_station.png`.
