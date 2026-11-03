# Fresh-map scrolling frame analysis

Recorded UTC: 2026-11-03T23:07:38Z

Harness: Codex desktop. Model: GPT-6; the exact deployment version and reasoning setting are not exposed in this session. Token counts are unavailable and are omitted. Hardware probing began at approximately 2026-11-03T22:27:11Z. The task included a prolonged wait for native Chrome UI access, which was not granted; the investigation uses the authorized separate Playwright browser instead.

## Request

> ensure to improve the fps and sudden frame drops during scrolling on the map. I got extremely worse after some of the recent commits. Make a deep analysis of what causes these frame drops and then make list of proposals on how to fix these. Make sure to first make a real test on my machine that has gpu support to be sure to find the root cause of the problem.

## Clarifications

> happens even on a fresh map

> test only on current origin/dev

> you can check out dev to local

## Scope

Test only fetched `origin/dev` (`c6a7aa7708bad205b07672622a94d794fcff267b`). Preserve the original divergent local `dev` branch. Deliver measured analysis and proposed repairs without changing gameplay rendering. Initial probes of the old checkout produced no completed benchmark and are excluded. Preliminary captures with uncontrolled camera movement are diagnostic evidence only; controlled-camera measurements supersede them.

## Outcome

The final performance capture completed at 2026-11-03T23:27:16Z. Exact end-to-end task duration and token accounting remain unavailable. The report separates initial existing-dependency diagnostics from verification after `npm ci` restored the current branch's lockfile. It identifies cold terrain page reconstruction, unstable water/cache policy, periodic autosave stalls, major-GC pauses, invalid WebGPU shader syntax and per-tile settings allocation. The user's sustained-slowdown observation was reproduced without profiling. Runtime repairs remain proposals. An existing U05433 asset-alpha replay failure reproduces on untouched origin/dev and blocks pushing under the user's pre-push rules; documentation is committed locally without changing the asset or assertion.
