# 2026-10-25 UTC

Model: GPT-6 (Codex harness). Exact model build, reasoning level, token counts and active task duration are unavailable.

## User prompt

Continue the existing tutorial narration work in:
https://github.com/theSystem85/code-for-battle

Work directly on the latest dev branch. The tutorial changes and drag-preview feature are already committed:
- 3c24dc24 — map-sprite previews during unit production drags
- 41c1dceb — player-driven tutorial and narration/progression fixes

Your task is to retrieve 13 EXISTING ElevenLabs recordings, install them in the repository, ensure the tutorial actually plays them, and push one additional audio-integration commit to dev.

DO NOT regenerate any audio. Do not call speech-generation tools or incur new generation charges. These recordings already exist in the connected ElevenLabs account, using Atlas Morgan — Narration & News, model eleven_v4. Previous downloads were blocked by the old execution environment’s network policy. Old signed download URLs have expired; retrieve fresh URLs for the existing generations.

Use the ElevenLabs plugin’s creative_show_flow_results with each flow_id and session_ids: [session_id], or an equivalent read-only retrieval operation. Retrieve the exact generation_id listed below. If a recording cannot be found, check the connected account/workspace and report the issue; do not replace it with a new generation.

Existing recording references, in CSV format:

step,filename,flow_id,session_id,generation_id
welcome,welcome-guided-0.mp3,ZY17holN4S1vpMpbjLnZ,EQKZXDCIQcLPS6gwZMkE,7jTn5dxz8bKPpSfE5dyx
build-power,build-power-guided-1.mp3,G7sSJ30jhW5knFlXUERH,Cz79K13FxnKG8wxshK8O,mnrYFYymwURIwq0qUvhn
build-refinery,build-refinery-guided-2.mp3,xq8ygSmYCTC71sGUcPUx,9K0OMErXchxUgK2j9aLI,psZHWxjXe4o23aELKQPv
build-vehicle-factory,build-vehicle-factory-guided-3.mp3,Ok6oSTyfSqi2vaX3EKr8,zudiEZ0t8irpHurl3J2Y,jHzMQk8rJoDOkf9P8U7j
build-harvester,build-harvester-guided-4.mp3,TnTmIzeFawq0AHRdQABG,hPAh0j8IbCmiFV4x6yTk,Igu8w3XA5kXoWWuBCD7N
select-group,select-group-guided-5.mp3,xAQt5jnuX0K79cXHcFsf,3HCQ39oxxknmDtPUgsZr,MOCmA0XW6QGCeaO6e2K6
tank-rally,tank-rally-guided-6.mp3,qkOBU3O5aBJy3yei4oh4,JBbV65HgvKkyZPZs7Xfz,75aaBKAW9IKdeh9nIvDO
tank-control,tank-control-guided-7.mp3,zzfTtxzVfSinPn7DDkgF,vpT6IsnGY1y30UT6fjTc,esNhltkPNxPlAuWn4PVS
crew-system,crew-system-guided-8.mp3,MRyACvw5bZ33H2SlOWud,xXt5rWrmu8F1k17XmD3m,dESsHN2EvRu7Zkc9mJZ8
tech-tree,tech-tree-guided-9.mp3,6SzQva9PPyqIphkhW8pr,NpOPLq0lL2npBJgG36Qc,cJXy2tX6BSbnbUPOPh7j
settings-help,settings-help-guided-10.mp3,joz0byIefwFgHROJyat1,tCHU7a024HdYo1nQ0s0w,HAx4MqyQqokUHxbBddI2
select-group,select-group-guided-11.mp3,IJsmxff1AV87dM7LNQE7,hwHDsO3gEOjLlHEny1Ef,WjwTqbLN7J5K5KctaxBM
tank-rally,tank-rally-guided-12.mp3,HZcVg62nFY5tq99yn9ky,WeX7GYq3sNRCSPTiKGcw,8MP2peWxG7kHHQBT8kzC

Implementation requirements:

1. Read AGENTS.md and the relevant ElevenLabs skill. Fetch the latest dev branch and preserve all intervening changes.

2. Download the existing recordings using their freshly retrieved URLs into:
   public/sound/tutorial/<filename>
   MP3 audio files are explicitly authorized for this task. Do not commit expiring remote URLs instead of the actual audio files.

3. Update:
   src/ui/tutorialSystem/narrationManifest.js

   Relevant playback and tutorial files:
   src/ui/tutorialSystem/narration.js
   src/ui/tutorialSystem/helpers.js
   src/ui/tutorialSystem/steps.js
   src/ui/tutorialSystem.js
   src/ui/inputMethodGuide.js

4. The narrator matches BOTH the step ID and normalized spoken text. Adding files or mapping by step ID alone is insufficient. Use the exact script/prompt returned with each existing generation, compare it with getSpokenTextForStep for the applicable input methods, and register accurate local paths and durations.

   The two select-group recordings and two tank-rally recordings are different input-method variants:
   - guided-5 and guided-6: mouse/trackpad guidance
   - guided-11 and guided-12: touch guidance

   Preserve existing recordings for unchanged steps. Preserve browser-speech fallback for custom bindings, unsupported variants/languages, and playback failures. Never play an outdated recording merely because its step ID matches.

5. Verify that the installed recordings actually get selected and played during the tutorial with narration enabled. Account for the project’s headless-audio mute behavior when testing playback; a muted test run alone cannot prove recorded narration works.

6. Preserve the existing progression rules:
   - User actions fulfill the step.
   - Automatic progression waits for narration to finish.
   - Completing actions early must not interrupt narration.
   - Manual Skip step interrupts the current narration and starts the next step.
   - Guidance must not perform gameplay actions except through the explicit skip path and the existing authorized crew-lesson setup.

7. Strengthen narration tests so the default mouse, trackpad, and touch tutorial scripts resolve to the correct local recordings. Test recorded playback, narration-end progression, manual skipping, and fallback. Do not merely accept TTS for these newly installed recordings or weaken assertions to pass.

8. Update the pending narration item in:
   docs/changes/2026-10-25-player-driven-tutorial.md
   Add the required prompt history/release note entries according to repository instructions.

9. Run the required lint, unit/integration tests, relevant browser tests, and build. The previous code-only work passed 5,541 tests and four focused browser checks, but verify your own changes against the current dev branch.

10. Commit the audio files, manifest integration, and related verification in ONE additional commit, then push directly to dev. This direct-dev workflow is explicitly authorized; do not stop after preparing local changes or ask again for routine Git permission.

Suggested commit title:
feat(tutorial): install existing ElevenLabs narration recordings

Report the commit hash, verification results, and any remaining genuine blockers. Do not regenerate recordings under any circumstances.
