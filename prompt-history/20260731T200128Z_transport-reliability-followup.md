# 2026-07-31T20:01:28Z

Processed by: Codex

## Prompt

1) there is still an issue with boarding ground units on ferry and hovercraft does not work reliably. Ensure to fix these issues. Also ensure that when hovercraft is selected that it can also move on land (which works but the move cursor is not shown over land which should).
2) when a ferry that has an ongoing embaring process is selected and the s key is pressed the embaring is stopped and the ferry can start a new embaring/disembarking process. Same for any ground unit that is also embarking or disembarking. MAKE sure there are never dangling dis-/embarking processes!
3) STILL it is an issue that selected ground units try to guard a ferry/hovercraft instead of embarking it. Embarking ALWAYS has prio over Guard mode! same for the ferry/hovercraft: they should NEVER guard a ground unit but embark the units when selected and target unit is clicked! Test the game yourself using playwright to ENSURE this is working! make an e2e test that has all embarking scenarios prepared so it can be tested quickly. one with one ferry and 10 tanks and one with 1 hovercraft and 5 tanks. for hovercraft make 2 tests one for embarking on land and one for embarking on water at the coast.
