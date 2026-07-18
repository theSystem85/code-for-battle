UTC Timestamp: 2026-07-18T14:08:59Z
LLM: codex

analyse the game for reasons causing micro stutters during scrolling the map and fix them so scrolling the map is super smooth and also when lots of action takes place on the map with animations and explosions ensure that there are no stutters on an iphone 13 pro max. take the branch "revet-to-642" as reference where there were no stutters visible. here is what you tried before and what did NOT help: 
```
Smoothed mobile frame pacing by changing the foreground mobile watchdog from a 17ms RAF competitor into a 250ms stall-only fallback, and by disabling that fallback during active scroll or visible combat effects so iPhone 13 Pro Max scrolling stays on native requestAnimationFrame cadence. gameLoop.js (lines 21-25)gameLoop.js (lines 157-160)gameLoop.js (lines 182-187)
Reduced heavy-action render pressure by adding mobile/touch effect profiling, culling offscreen dust work, preserving/restoring canvas alpha without per-particle save/restore, skipping nonessential explosion shockwaves/embers during mobile scrolling or many simultaneous explosions, and removing per-frame additive animation filter allocations. effectsRenderer.js (lines 171-179)effectsRenderer.js (lines 438-457)effectsRenderer.js (lines 547-558)effectsRenderer.js (lines 591-601)
Avoided dust-particle GC churn during action scenes by cleaning expired dust particles in place instead of allocating a filtered array each frame. effectsRenderer.js (lines 605-618)
```
