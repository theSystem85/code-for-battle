# 2026-03-04T11:21:25Z
LLM: codex

Prompt:
integrate mercury m2 LLM diffusion model from inceptionlabs.ai as a new LLM provider into the game to control the enemy AI (if user selects the model). Here is the official docs:
https://docs.inceptionlabs.ai/get-started/models

1) ensure to integrate the api key input section part to the settings modal similar to how it is done already for openAI.

2) Ensure the user can assign different LLMs (from different providers) to control different parties of the game. So for example the user can assign openAI with gpt-5-nano to control yellow party and InceptionLabs with Mercury M2 to control red party and also the local default non LLM controlled AI to control blue party (just as an example).

3) AFAIK Mercury M2 API is compatible with openAI standard so you can use the same JSON schema that is currently in use as well. Keep everything similar to how it is done for openAI already unless you see differences in the API docs from https://docs.inceptionlabs.ai/get-started/models or related pages that require adjustments.

4) Ensure in the settings the user can add a list of LLM models to the pool of options that can be used to control the enemy AI of a party in the game. So the user has to choose the model provider, then choose the model and click add button get add the model to the available list of models for the game. Then the user can repeat that to add another model. Put this input to the very top of the LLM settings part of the general game settings modal. Ensure the user can enter a different api calling interval for each model added to that list so that this interval will be used when that model is chosen for a party to control. Ensure the set interval is visible in the list as well on the right of the model name like "gpt-5-nano (60s)" or "Mercury M2 (15s)". By default the value from the general inverval setting is used that already exists but if the model specific interval input is used then it will be dominant!

5) ensure the user can now in the settings enable multiple LLM models from multiple providers (for now just openAI and inceptionLabs) so that these models can then be used from a list to pick to assign to a party in multiplayer part of the sidebar on each parties entry in the list (there is already a switch for local versus LLM, expand this switch so the user can now choose between "local" and any other LLM model that was added in the settings to be used for the game)
