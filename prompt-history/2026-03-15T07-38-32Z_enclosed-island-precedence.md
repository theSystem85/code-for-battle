# Fix Enclosed Island SOT Precedence

**UTC Timestamp:** 2026-03-15T07:38:32Z  
**LLM:** Copilot (GPT-5.4)

## Prompt

> it is getting better but here are more edge cases (I marked the wrong SOT in the image)

## Summary of Changes

- Disabled ordinary water-on-land SOT for enclosed land/street islands so inverse island smoothing is not cut back by extra water wedges.
- Added focused coverage proving enclosed islands keep inverse land SOT while non-enclosed coastlines still retain normal water SOT.
- Updated the spec and bug tracker to record the enclosed-island precedence rule.