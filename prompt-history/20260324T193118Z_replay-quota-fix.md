# 20260324T193118Z replay quota fix

- Model: GitHub Copilot (GPT-5.4)
- Prompt:
  - when trying to load a 4 player replay I get this console error: "Uncaught QuotaExceededError: Failed to execute 'setItem' on 'Storage': Setting the value of 'rts_save___replay_baseline__load_1774380191749' exceeded the quota.
    at loadReplay (replaySystem.js:1021:16)
    at btn.onclick (replaySystem.js:1124:25)" I attached the replay file so you can investigate and fix the issue

- Summary:
  - Investigated the attached replay payload size and confirmed the failure came from replay loading duplicating the embedded baseline state into a temporary localStorage save.
  - Refactored save loading to accept direct in-memory state objects and switched replay loading to use that path, avoiding the extra storage write that triggered quota exhaustion on larger 4-player replays.
