# Automation release evidence

This file records implementation evidence for specs 100–108. A checked software test is not a claim of real-device keyboard or qualifying-hardware performance certification.

## Verification matrix

| Contract | Evidence | Status |
| --- | --- | --- |
| Full grammar and current catalogs | `node scripts/validateAutomationDocs.mjs`: seven complete examples accepted by spec100 parser | Examples verified; full catalog coverage in spec100 suites |
| Source-authoritative DAV/ATV and migration | Source-store and editor integration suites | Awaiting integration |
| IF/ELSE, WHILE and AFTER | Pure stepper and compiled differential suites | Awaiting integration |
| Four automation categories | Runtime/UI adapters and production/combat scenarios | Awaiting integration |
| Phone versus tablet shell | Device classifier and browser layout scenarios | Awaiting integration |
| EN/DE landing | Localized anchor, documentation and screenshot checks | Awaiting integration |
| Real screenshot provenance | See capture instructions below | Awaiting integrated editor |
| iPhone Safari keyboard, rotation and flyout accessibility | Physical device verification | Open: unavailable in cloud runner |
| At least 75 presented FPS under active worst-case gameplay | Qualifying reference hardware protocol, spec 107 | Open: headless/software browser cannot certify |

Local documentation checks: relative links valid; all seven CFBL examples accepted by the shared parser. Full lint passed for the initial documentation/landing slice. The full unit run was stopped to avoid concurrent resource contention; the root orchestrator runs it on the combined branch before concluding.

## Screenshot provenance

Capture only the real integrated game UI. Source assets belong in `public/images/landing/automation/`, encoded with WebP quality 85. Each capture records the command, implementation revision, viewport/DPR, locale, demo seed/save and exact source fixture. Desktop Buttons and CFBL shots must show the same accepted program. Capture phone portrait and a bound defence building separately; keep tablet bounds and keyboard checks in verification evidence even when not used as marketing crops.

## Developer execution note

Accepted CFBL edits compile to inert instructions outside the simulation loop; gameplay evaluates the resulting state machines through normal game command APIs without parsing source each tick.
