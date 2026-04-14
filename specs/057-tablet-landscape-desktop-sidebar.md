# 057 - Tablet landscape desktop sidebar behavior

## Summary
On touch tablets in landscape orientation, the sidebar should behave like desktop mode instead of mobile-landscape mode.

## Requirements
1. Keep mobile portrait behavior unchanged on touch portrait devices.
2. Keep mobile landscape behavior unchanged for phone-scale landscape screens.
3. For touch landscape screens where the viewport short edge is at least 600 CSS pixels, do not apply `mobile-landscape` or `mobile-portrait` body classes.
4. Ensure sidebar/layout updates still flow through `applyMobileSidebarLayout` with `null` mode for tablet landscape so desktop layout logic remains active.
