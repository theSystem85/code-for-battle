# 2026-07-11T21:13:41Z

LLM: Codex

there are 2 major issues with the monitor mode now:
1) the button is not visible on mobile becuase it is hidden on the right side
2) I cannot even run the monitoring becuase the game crashes before or does not load correctly
=> try to fix the performance issues now directly without the data from the monitor mode, then we will see if I can run the monitor mode to further improve the performance. Keep in mind on the branch "revet-to-642" everything was still working fine performance wise but after we started to implement the DPR (initially it was only 1) settings for the game everything went much worse. So focus now on improving stability and performance. I want the game to ALWAYS run on 60fps on my iphone 13 pro max! Besides that you should also introduce a new webGPU rendering option so the user can switch between webgpu or current webgl (for legacy support). Besides that you can also consider loading map tiles with lower PPI first when scrolling is fast and when screen is more stable in a region to load higher DPR (max 3).
