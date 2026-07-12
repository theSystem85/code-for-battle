# 2026-05-02T19:08:22Z

LLM: codex

## Prompt

the 60fps only work when user does not scroll, as soon as the map is scrolled to about 2 screen widths the next terrain is loaded and it gets very slow and the entire browser crashes soon after!! Ensure the extend the mobileFpsRegressionBenchmark so that it also covers scrolling over the entire map without ANY drop in frame rate, IF the framerate drops below 60fps during scrolling the test MUST fail! Then after extending the test ensure to fix the game so it satisfies the new tests conditions! To find the root cause for the poor mobile performance compare the deployed versions https://deploy-preview-650--code-for-battle.netlify.app/ (new current with poor performance) and https://deploy-preview-645--code-for-battle.netlify.app/ (old with almost 60fps constantly)
