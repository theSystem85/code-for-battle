# 2026-10-26T22:59:16Z

Model: Grok 4.7
Harness: Cursor Cloud Agent

## Prompt

Feature work for Patrick on code-for-battle, from current `dev`. Investigate the existing carrier, airstrip, helipad, and F22/F35/Apache land, attack, refill, and guard code, then implement:

1. An Apache can land on an airstrip in addition to existing pads and carriers.
2. With a carrier selected, an attack command (including force-attack) keeps the carrier moving toward its last move target. It does not path to the attack target. All air units currently carried launch and receive that same attack target. The carrier association stays unchanged.
3. Stop-attack on a selected carrier makes every unit assigned to that carrier stop attacking and return to land on the carrier.
4. Associated F22, F35, and Apache aircraft that need a refill return to the carrier automatically, reload, then resume the attack until the target is destroyed. Multiple cycles are allowed. When the target is destroyed they return and land on the carrier.
5. The association between a carrier and an air unit changes only when the user assigns that unit to land on another carrier, or (F35/Apache) a helipad, or an airstrip.
6. A selected airstrip behaves the same way: attack, force-attack, and guard on a friendly assign that order to all units based there.
7. Guard: F35 and Apache follow the guarded unit and attack anything that attacks the guarded unit or themselves. An F22 stays at port; when the guarded unit or the F22 is attacked it takes off and attacks that attacker until destroyed, including refill cycles on an airstrip or carrier, then returns to port.

Branch from `dev`, follow AGENTS.md (lint, unit tests, docs/changes, prompt-history). A pull request against `dev` is fine; Grok Bot lands it onto `dev`. Report behavior coverage and files.
