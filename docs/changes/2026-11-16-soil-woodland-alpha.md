- [x] **Soil woodland source-alpha integrity** — Regenerate the existing soil woodland atlas from its authored source after the latest dev baseline failed the exact-alpha check at 98 pixels; keep the 24-sprite layout, metadata and WebP q85 policy intact.
  Spec: none

Verification: U05433 reproduced on unchanged origin/dev inputs. Regenerating only `dtv7_nature_soil_large` changed its WebP and no metadata or layout. All 18 U05433 source-profile cases passed afterward; no assertion or tolerance was changed.
