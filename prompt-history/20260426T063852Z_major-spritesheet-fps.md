# UTC Timestamp
2026-04-26T06:38:52Z

# LLM
GPT-5.3-Codex

# Prompt
With the last merge the mobile frame rate dropped to 30fps instead of 60fps. I assume due to too much sprite sheets used in parallel. Ensure all sprite sheets that are used by default are compiled into one at build time (there is already a pipeline for that combining all single objects image assests into one. Ensure this is still in use and also add all tagged and in use tiles from all default sprite sheets into the same major compiled sprite sheet. With that sprite sheet also compile a combined version for all corresponding json files used for the taggings of the used sprite sheets. Besides that evaluate the runtime and memory performance of all involved components and make improvement suggestions. Also ensure I can/change see the major sprite sheets (call it like that in The code and docs as well) in the SSE as an option in the dropdown and when opened its combined tags are loaded!
