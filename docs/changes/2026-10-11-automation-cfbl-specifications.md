- [x] **Improvement: Automation documentation terminology**
  Renamed feature prose and documentation paths from policies to automation with a cheap subagent, preserving concrete legacy code/API references, unrelated policy concepts and existing prompt-history.
  Spec: [Automation program](../../specs/099-automation-cfbl-program.md)
- [x] **Feature planning: CFBL and synchronized automation editors**
  Created detailed specs 099–108, the complete planned grammar/catalog/reference, and a dependency-aware implementation plan; user confirmed IF/ELSE pairs.
  Spec: [Automation program](../../specs/099-automation-cfbl-program.md)
- [ ] **Feature: Implement and validate the automation program**
  Runtime/UI/phone/defence/compilation/landing/screenshots and device/performance acceptance remain follow-up implementation work; planning does not mark them shipped.
  Spec: [Implementation plan](../automation-implementation-plan.md)

Validation of this documentation-only task: `git diff --check` passed; 36 changed/new documentation files and 464 local links checked; all 9 implementation packages have dependency/acceptance/handoff contracts; the language reference matches the normative grammar; all 6 examples match the EBNF/closed vocabulary and legal state references. Catalog review covers 19 numeric fields, 19 checks, 25 existing effects, all unit/building types, 6 deliveries and 6 defence types. These checks validate specifications, not execution of the unimplemented parser/runtime. No runtime code, landing implementation or screenshot assets were changed; game tests were not run for documentation-only work.
