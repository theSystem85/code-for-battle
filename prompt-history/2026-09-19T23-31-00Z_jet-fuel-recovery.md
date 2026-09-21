# 2026-09-19T23:31:00Z

**LLM:** Cursor Grok 4.6 high-fast (`cursor-grok-4.6-high-fast`)  
**Harness:** Cursor Cloud Agent  
**Tokens / duration:** not available from this run

## Prompt
Fix and complete jet (F22, F25) fuel / return-home / crash-landing / ground recovery behaviour so players cannot strand jets on impossible missions, and can recover them when they do run out of fuel.

Required:
1. Return home before fuel runs out
2. Refuse impossible targets before takeoff with a clear insufficient-fuel notification
3. Out-of-fuel emergency landing using the existing landing animation plus notification
4. Tanker can refill grounded out-of-fuel jets
5. Recovery tank must pull the jet onto a street before takeoff
6. S releases any mounted unit

Investigate existing systems first and reuse them. Open a PR with a clear summary and manual test cases.
