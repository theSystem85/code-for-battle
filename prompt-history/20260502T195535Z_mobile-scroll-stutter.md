# 2026-05-02T19:55:35Z

LLM: codex

## Prompt
it got much better now but still far away from the performance I once had because:
1) when I scroll It stutters as soon as new chunk get loaded (can this be done in another worker in the background to keep main thread smoothly rendering?)
2) when I scroll too fast at some point I see black tiles (tiles that were not yet loaded) and then performance drops dramatically to about 30fps and the water is not yet rendered at all anymore (just black tiles). I guess it happens when a new chuck gets loaded before the old finished loading.

Try now to fix all these issues and if you encounter more things to improve stability and performance implement them as well!
