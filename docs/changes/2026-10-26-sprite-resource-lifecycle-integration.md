- [x] **Improvement: Complete bounded sprite resource lifecycle integration**
  Prepared sprite and explosion resources now use visible pins, byte-based eviction, generation-safe publication, active-job cancellation, failure retry, shared source/view accounting, and deterministic teardown. Identical live registry registrations are idempotent while incompatible replacements remain errors.
  Spec: none

Validation uses focused lifecycle, registry, asset-loading, explosion-preparation, sprite-sheet, and prepared-pipeline unit tests plus repository lint. Apache frames continue to use shared atlas views rather than per-frame cropped bitmaps. Hardware draw/upload and native-memory comparison remains pending on qualifying hardware; no Q30/Q31 values are inferred.
