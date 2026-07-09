# 2026-07-09T19:36:04Z

LLM: codex

Prompt:

> compare the changes of this branch to the branch "revet-to-642". latter was still working very well 60fps from performance on my iphone 13 pro max but current branch performs very badly so that the app still crashes. first I can see the map rendered then the map gets black, then the entire page reloads and then the browser tab is completly dead. Make sure to write a test that can reproduce the issue and or let me know how to reproduce it on my real iphone device since our current e2e test benchmark running in ios emulator with iphone 13 pro max also does not reproduce the issue and the performance looks quite ok BUT I notice these issues in the emulator view that you also have to fix:
> 1) the map for the benchmark or test is way too small, take at least 100x100 map size
> 2) when scrolling some parts of the map tiles like streets get rendered in white from time to time like a slow flickering between actual tile texture and white
> 3) ensure to first write a reliable e2e test that can reproduce the issue with my real iphone (maybe so that I can connect it and you can inspect the real browser tab) because first I do not want the app to crash anymore. Then after that I can see the real performance on my phone and then we can continue to fix the performance issues but the crashed might be related to it. let me also know how to connect my iphone so you can debug while running the e2e test on my phone. create a separate test for testing on the real hardware and do not override the existing one on the emulator. best case you would use the same test but with a different flag for defining the target device and have 2 different scripts for the e2e tests in package.json that can trigger the test with different devices (emulator ios iphone 13 pro max vs real one).
