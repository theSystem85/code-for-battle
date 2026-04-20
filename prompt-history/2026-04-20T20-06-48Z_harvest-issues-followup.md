# 2026-04-20T20-06-48Z
# Model: copilot

## Prompt
some more harvesting related issues to fix:
1) ensure the ore on the map is always generated initially with a gradient from outwards to inwards (inwards is where the seed crystal is) so that the least dense ore is outwards. Prevent that the entire ore field is just density 5 ore that initially no non experienced harvester can harvest.
2) when user commands a single harvester to an ore tile ensure that the harvester will actually go to that very tile and not to any other ore tile close to it at the same ore field! Only when multiple harvesters are selected and commanded to harvest the same tile they should spread to other available ore tile around to prevent blocking each other at harvest.
3) ensure the harvesters do not turn (rotate) so quickly but just about 50% faster than a tank.
4) ensure the host can also set the maps ore spread intervall in the map settings by a number input in seconds. this input should be located to the right of "Total ore value" input.
