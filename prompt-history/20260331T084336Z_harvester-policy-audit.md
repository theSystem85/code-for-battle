# 2026-03-31T08:43:36Z
Model: codex

## Prompt

Make a deep analysis of how the harvester behaviour is controlled and managed. Figure out why harvesters (enemy's and player ones) can happen to sit idle on ore fields (when fuel is enough) or still end up in some rerouting loops. Ensure that can never happen. Explain your findings and fixes to prevent that. Also make a mermaid diagram in a havester-policies.md file that explains ALL havester automated behaviour for player and enemy AI units. In general the harvester policies should be like this (ordered by highest prio, most of it should already be implemented but verify and fix if needed):

1) go where player send you (you means the harvester itself). When target not an ore field sit there idle until player sends you to an ore field then do fully automated harvesting (includes unloading at the refinery).
2) when coming out new form the factory go to nearest ore filed to harvest fully automatically.
3) always prefer the refinery the player has assigned you to
4) ONLY enemy AI: when harvester got attacked go back to refinery immediately and then go back to harvest loop again.
5) when harvester cannot reach targetted ore tile and is unproductive (means not moving back to refinery or actively harvesting or moving to ore field and getting closer successfully) for more than a minute then assign a different pseudo random ore tile at similar distance to the targetted refinery.
