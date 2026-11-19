# Prompt History

- UTC timestamp: 2026-11-19T15:17:00Z
- Model: GPT-6
- Harness: Codex desktop
- Elapsed from first repository inspection through verification: 37m 46s

## Prompt

write a performance benchmark that figures out the best (60fps goal) graphics setting for the device the benchmark is running at when it is running. Make a priority list of which togglable or scalable graphics features cost highest performance drops so they can be adjusted first. when the benchmark is done the user gets proposed an optimal set of graphics settings that can then be applied by clicking on an apply button in that performance report dialog. The performance benchmark should run multiple tests based on the most important graphics features on and off so the user can get an impression of the real world costs of each feature on his device. The result will also be persisted on that device an can be shown as tooltip infos for each graphics setting once the benchmark was done! It will be overwritten once another benchmark concluded. Figure out which features are worth testing separately by this benchmark but at least these features need to get a separate on/off test: shadows, HUD selection, DPR 1-3, custom sprites, smoke. Ensure to have a map setup for the test where the entire base with all buildings is visible and every unit type (ground, air, water) and there is a combat ongoing! Make sure the setup looks realistic (no ground units on the water or water units on the ground, nothing stucking inside sth else and so on!). Do not commit until I say so and keep everything local for now!
