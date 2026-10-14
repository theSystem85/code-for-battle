# 111 — Keyboard camera pedals

Arrow-key camera movement accelerates while held to the existing configurable maximum. Opposite input first decelerates to zero, then accelerates in the new direction. Releasing an axis applies strong automatic braking; opposite simultaneous keys cancel and brake. Clamp the map and clear outward momentum at its edges. Preserve selected-unit steering, mouse/trackpad gestures, gamepad speed and minimap focus.

Runtime Config → Controls exposes maximum keyboard speed (existing 60 Hz pixel/frame units), acceleration (default 1,200 px/s²), reversal deceleration (2,400 px/s²) and automatic release braking (3,600 px/s²). Zero automatic braking permits coasting. At the default 480 px/s cap, release stops within about 0.133 seconds instead of the former roughly two-second coast. Changing settings affects the next frame and uses the existing runtime-config reset behavior.

Use elapsed real frame time, including paused-map rendering; cap a long frame at 100 ms. No dependence on game speed or OS key-repeat frequency. Camera velocity units remain compatible with pointer/gamepad input. Keep independent axes and existing diagonal behavior.

The camera update runs once per rendered frame, including paused redraws. Added work is two constant-time scalar integrations, independent of entity count and device-pixel ratio: at 320 entities/DPR 2 this still means two scalar calls, no per-entity multiplication, allocations, scans, array replacement, extra drawing, uploads or changes to visual quality. Retain velocity object identity.

Acceptance: increasing speed while held; bounded maximum; rapid release stop; controlled reversal; opposing keys; per-axis diagonal release; frame-rate consistency at 30/60/120 Hz; configuration edits/reset; bounds and existing alternate inputs. Unit tests plus live browser held-key/release checks are required.

Software verification on 2026-10-14: full unit suite passed (254 files / 4,855 tests); the focused keyboard camera, map scrolling and game loop suites passed 63 tests. Chromium verified holding a real direction key ramps speed without key-repeat input, changing acceleration through Runtime Config takes effect, and default release braking stops within the bounded distance/time assertion. Full lint and production build passed. Minimum configured speeds remain active during paused redraws instead of being lost to the old inertia threshold.

## Performance evidence

Paired live full-map traversal used unchanged 320-unit/DPR-2 settings, cold first traversal and a repeated full-map route with selected overlays/combat. Both direction axes stayed active. Reproduce with `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium PERF_KEYBOARD_SCROLL=1 PERF_DURATION_MS=15000 PERF_SCENE=traversal PERF_UNITS=320 node scripts/performance/microstutterBenchmark.mjs /tmp/keyboard-camera.json`. The optional keyboard mode exercises both axes during the existing route without changing rendering fidelity.

| Diagnostic | Before | After |
| --- | ---: | ---: |
| FPS | 11.59 | 11.60 |
| Frame p95 / p99 / max (ms) | 133.3 / 166.7 / 183.3 | 133.3 / 150.0 / 166.8 |
| CPU update p95 (ms) | 63.9 | 63.6 |
| CPU render p95 (ms) | 15.8 | 15.2 |
| CPU full work p95 (ms) | 71.3 | 75.0 |
| Missed 13.33 ms frame deadlines | 174/174 | 175/175 |
| Route distance (px) / completed cycles | 27,029 / 1 | 27,149 / 1 |
| Page errors | 0 | 0 |

Raw [before](../docs/performance/keyboard-camera-before.json) and [after](../docs/performance/keyboard-camera-after.json) retain per-frame intervals, CPU tails, scene counts, heap samples and backend/DPR evidence. Backend was headless Chromium with Vulkan SwiftShader; GPU hardware timing was unavailable. Combat leaves slightly different surviving entity counts, so this pair is diagnostic and establishes neither a speedup nor physical performance certification.

**75 FPS reference-hardware gate: open.** The existing heavy battle already misses deadlines in this software-rendered environment. Headless/software rendering cannot certify 75 presented FPS; the qualifying physical-hardware fast-scrolling/combat/selection/water protocol in `performance_improvement.md` remains required. No visual fidelity, resolution, frame cadence or entity-count reduction was used to improve these numbers.
