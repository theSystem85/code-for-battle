# 2026-04-20T19-10-27Z
# Model: copilot

## Prompt
there are now suddenly some issues with the harvesters:
1) they do not immediately start to go harvesting anymore after spawning (or at least it takes much longer than before)
2) when not selected I can see the loading bar going up while harvesting but when selected I do not see the loading progress anymore.
3) it happens that the harvester when fully loaded it just restarts again so it is actually never finished (does not happen always or only after a few harvest cycles)

these issues happened after commit 26042046da45c70d2c96e9e50c5d939b3b62ba9b. Analyse that commit and its prompt to get an overview of what was achieved and fix all issues mentioned above without reverting any features from that commit.

also ensure when multiple harvesters are selected and commanded to harvest one tile at an ore field that the harvesters actually spread among the neighbour tiles of that ore field so each harvester gets its own ore tile to harvest.