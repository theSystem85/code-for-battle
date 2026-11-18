# 2026-11-18 12:37:09 UTC

Model and harness — GPT-6 family in Codex desktop. Elapsed time was about 20 minutes. Exact model build, reasoning level and token counts were unavailable.

> Did you complete all issues from the CPU-related performance fixes already? If yes, make a list of improvements for GPU-related flows and consider using parallel compute where possible so the main rendering thread can always run at 60 FPS regardless of the number of units currently on screen or where the user scrolls.
> 1. Make the list of improvements with the most important issues first. Start there.
> 2. Implement and test the fixes and write the test results into a report like you did for the CPU tasks, with real measured minimum and average FPS.
>
> Ensure the tutorial is not shown during the benchmarks and the camera remains stationary while a huge number of units are on screen, because that is where the current performance bottleneck lies. As soon as the Apache fires and the explosions start I see strong FPS degradation. Start now and make a commit for each fixed item.
