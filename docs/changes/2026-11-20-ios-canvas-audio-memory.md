# 2026-11-20 iOS canvas and audio memory

- [x] **Keep the iPhone canvas budget and decoded sound cache inside WebKit's limit**
- iOS backing stores are capped at 2× so a saved graphics density of 3 cannot blank the map, terrain pages are sized for that density and limited to a 96 MB resident budget, a lost shoreline canvas context is skipped instead of throwing, and decoded sound effects stay in a 12 MB LRU that shares in-flight decodes and drops both takes when the version changes.
- Spec: none
