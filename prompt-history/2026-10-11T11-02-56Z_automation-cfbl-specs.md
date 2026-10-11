# Automation and CFBL specifications

UTC timestamp: 2026-10-11 11:02:56 UTC
Harness: Codex desktop, managed cloud workspace.
Primary model: GPT-6; exact serving variant/version and configured reasoning level are not exposed by this session.
Delegated documentation rename: GPT-6-Luna, medium reasoning (explicitly selected cheap subagent).
Token counts and complete task duration are not exposed; omitted rather than estimated.

## User request

1) rename all occurrences in specs and all other doc files from policies to automation. For example the policies dialog becomes the "Automation" dialog and so on. Use a cheap subagent to do that!
2) From now on I will talk about the automation feature. This is the reason why the game is called code for battle because of this automation feature. The goal is to make it as easy as possible for the user to build these automations. The current automation dialog is still a bit too unhandy to use on an iphone so I want you to always show that modal in full screen on a mobile device (but not on the ipad only phones).
3) Ensure there is another UI to enter the automations which is entirely text based. For that create a domain specific language that supports all the currently implemented features and is fully compatible with the current state machine approach. Basically it should just be another UI to enter the state machines for the automations based on text only but with autocompletions and flyouts showing all current available options for values or keywords to enter based on the grammar (use fuzzy search!). Also show in the docs the entire grammar for that language with explanations and examples on how to use it!
3.1) the policies editor should have in the title a toggle button for the UI to switch between the currently implemented View (button based) and the new text based View.
3.2) the automation text view (ATV) will be always in sync with the default automation view (current implementation, lets call it DAV for default automation view).
3.3) this domain specific language (DSL) should be called CFBL for code-for-battle-language.
3.4) the ATV has a text area input where the user can enter the code. The editor does not allow entering any word that is illegal in the grammar of CFBL. It works like this: the user enters something and a flyout shows all possible options that can be entered at this place so the user has to choose one (the user can only choose legal options).
3.5) CFBL does not have variable names. For states of the state machine it will use just automatically generated indexes from 1 to n. Also apply this to the DAV where it is currently still possible to enter names for the states but that should not be required and therefore automated showing indexes instead.
3.6) CFBL must support all currently implemented features used in the DAV.
3.7) Ensure DAV and ATV also support "else" flow (currently only "if" is supported).
3.8) ATV will show the entered text a bit like monokai with syntax highlighting so based on the grammar the words will be colored differently (ensure to get the contrast on the dark BG right!)
3.9) the flow of a statements grammar will be aligned with the current flow of how to define a state machine in DAV starting with the type of the automation first (control (unit or defence building), build (unit or building))
4) add also automation support for defence buildings (similar to unit control automation)
5) ensure to document everything and update the landing page with details of this automation feature (including screenshots)
6) running these scripts should be super efficient and not slow down the AI and game loop significantly! Evaluate if it would make sense to precompile it after user updated automations to increase performance!
7) ensure ATV will also in the background generate CFBL code as source of truth!

let me know if you have questions or ideas on what is missing or where you see conflicts or problems. I want you now to create detailed specs and an implementation plan that I can use to delegate to agents for implementation so I only give them the spec number or range to implement.

## Clarification confirmed during the task

Question: For “else”, use an immediate alternative attached to an IF rule, taken when that IF condition is false, not while an AFTER timer is pending or a WHILE state is held?
User answer: “Yes, use IF/ELSE pairs”.

## Scope and result

Documentation-only task: rename feature documentation, create specs 099–108 and a dependency-aware implementation plan, publish the entire planned CFBL grammar/catalog/examples. Runtime/editor/phone/defence/landing/screenshots and hardware validation are delegated follow-up work. Existing prompt-history entries were preserved.
