UTC: 2026-10-14 08:42:18
Model: GPT-6 through Codex. Exact serving variant, reasoning level and token counts are unavailable.

Prompt: Ensure the map scrolling when using the arrow key happens more like accelerator pedals so the longer a direction key is pressed the faster the scrolling will be (ensure to make these accelerator values configurable in runtime config at the controls section for de/ac-celeration and auto break when no direction key is pressed (it should behave like one pedal driving on an EV). The current auto breaking is way too little so ensure the default scroll breaking is much stronger.

Implementation: Time-based, constant-cost keyboard camera acceleration, reversal deceleration and strong release braking with Controls runtime fields. Preserve selected-unit steering and existing pointer/gamepad camera behavior. Defaults reach 480 pixels/second in 0.4 seconds and brake to rest in roughly 0.13 seconds. Paused redraws use real frame intervals and retain low-speed keyboard activity.

Validation: 254 unit files / 4,855 tests, 63 focused camera/loop tests, a Chromium held-key/runtime-controls scenario, changed-file lint fix, full lint and production build passed. Paired 320-unit/DPR-2 live scrolling diagnostics recorded roughly 11.6 FPS in both runs under headless SwiftShader, with no page errors. Spec 111 retains raw frame/CPU/heap/backend evidence and explicitly leaves the physical 75 FPS reference-hardware gate open.
