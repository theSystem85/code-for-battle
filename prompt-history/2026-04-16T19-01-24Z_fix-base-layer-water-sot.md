# 2026-04-16T19:01:24Z UTC
Processed by: GitHub Copilot

the issue is still there look at the attached image. For me it looks like only on the edges to other terrain or the map border the water rendering is correct but in the inner parts of the water where water is surrounded by other water there are these incorrect SOT tiles where the upper SOT water is incorrectly shown and the lower one is correct. Dig deeper into the issue analysis and fix it so the water looks procedural correctly. ENSURE SOT is not used in the first place to render the water becasue inner water tiles should not have any edges for SOT in the first place. Keep in mind that this error does not happen when custom sprites are toggled off. Then procedural water is always fine! So no go and fix it finally!
