# 2026-09-16T12:47:51Z

Lead model: GPT-6 Astra (`gpt-6-astra`), medium reasoning, as specified for this session. Harness: Codex desktop. Delegated models: three GPT-5.6 Luna (`gpt-5.6-luna`) agents, medium reasoning, for read-only audits and review. Internal model build version, token counts and exact total task duration are unavailable and are not estimated.

## User prompt

All these recent map rendering visual improvements made the game fall from 75(capped) to about 40fps when scrolling. Analyse the performance bottlenecks in rendering and make a plan on how to optimize the entire rendering pipeline so the game will ALWAYS run at 75fps when scrolling fast while not deteriorating the visuals. Maybe some initial map baking process could help. I have the intuition that currently way too many operations during rendering are not cached and could be "baked" initially. Make sure not to destroy the procedural water animations though! You are GPT-6 Astra on medium reasoning. I want you to make a detailed plan (create performance_improvement.md) based on your detailed graphics rendering bottlenecks analysis (create rendering_analysis.md). Based on that you make a plan to implement the fixes. You will not change any code. You have to use GPT5.6 lunar subagents instead! If you cannot control subagents from this harness let me know and I will do it for you. I just want to say to each sub-agent do X Y Z step of the rendering_improvement_todos.md (create that file). Ensure all steps can be run in parallel so concurrent agents will not interfere or split the issues in sections where I can see what can run in parallel and what not. Also put into that plan additional helper tools to see what the current performance bottleneck is (memory, cpu, gpu, which exact function takes most compute time (I want to see a live list of functions sorted by their compute times to see potential bottlenecks( make it an extra option in performance monitor overlay that can be toggled on and off)). Also find out if any map assets get dynamically during gameplay resized or not (I want not resizing to happen at any time (other than planes or helis during start/land animations). All resizing should be baked before the game starts or ideally already in the loaded game assets (if there are issues let me know and but them into the todo list. Also update the agents.md that 75fps is minimum frame rate that must be maintained for any new code changes! no more compromises on performance!

## Scope and result

Documentation-only change. Created the three requested root documents, updated AGENTS.md/TODO and affected specifications, and added the strict rendering-performance specification. No application, shader, asset or test code changed. Existing staged package/version changes were preserved.

Used model-specific subagents supported by this harness. Audit assignments: terrain/caching/water, assets/resizing, and monitor/scheduler/benchmark gaps. Follow-up reviewers checked the draft for material errors and parallel-ownership conflicts. No worker changed files or ran competing benchmarks.

Existing mixed-biome scrolling test measured 43.67 FPS, 7.95 ms terrain, 9.10 ms render. An additional transient Playwright CDP CPU profile of the 200×200 fast-scroll route identified repeated cache signature hashing as the largest application JS leaf, with CPU water next among major render costs. Both runs used CPU fallback; no physical GPU/75 Hz certification was claimed. Three terrain atlas dimensions were verified with sharp metadata for decoded-memory estimates.

## Delegated audit instructions

- Terrain: read-only audit mapRenderer/organicTerrain/cliffTerrain/textureManager/GPU paths; identify exact repeated work, invalidation, startup baking, water constraints, memory costs and disjoint work breakdown. No edits or benchmarks.
- Assets: read-only audit map/entity sizing and preparation; distinguish source/destination scaling, DPR and camera behavior; enumerate functions and preserve aircraft exceptions/visual fidelity. No edits or benchmarks.
- Monitor: read-only audit performance monitor/UI/game loop/renderer/canvas/benchmark gates; identify measurement blind spots, function-ranking contracts and validation requirements. No edits or benchmarks.
- Review: inspect the new documents for factual inaccuracies, visual-fidelity risks and task ownership/dependency conflicts. Return actionable findings without modifying files.

## Verification

The existing opt-in mixed-terrain browser diagnostic pair passed its historical thresholds; those thresholds do not pass the new 75 FPS requirement. CPU sampling ran without repository code changes. Whitespace and Markdown local-file link checks cover the documentation. Unit tests/lint are not rerun for this documentation-only task; implementation steps explicitly retain the repository's required checks.
