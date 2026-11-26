---
name: to-do-list
description: Brainstorm Code for Battle to-dos by voice, keep a draft during the conversation, and save the agreed list in docs/brainstorm.md when the user wraps up.
---

# Voice To-Do List

Use this workflow in ChatGPT, Grok, Grok Bot, or any other agent when the user says “Lass uns den To-Do-List-Skill durchführen”, “Lass uns To-dos brainstormen”, or makes an equivalent request.

1. **Start.** Acknowledge in the user's language. Start a draft in the current conversation. If the user asks to continue an existing entry, read [the backlog](../../docs/brainstorm.md) if available.
2. **Brainstorm.** Accept free-form speech. Keep short titles and capture the user's intent, constraints, priorities, and open questions as they emerge. Apply corrections and removals to the draft. Merge repeated mentions of the same item when the intent is clear. Keep spoken acknowledgements brief and ask one short question when ambiguity changes the task. Read back the draft when asked. During brainstorming, keep the draft in the conversation.
3. **Wrap up.** Treat “Brainstorming abschließen”, “Speicher die To-dos”, or an equivalent explicit request to finish as authorization to save the agreed draft. Briefly summarize what is being saved. Ask for clarification only if it affects what should be recorded. Preserve unresolved design questions as open questions.
4. **Save.** Grok Bot writes the shared backlog. ChatGPT, Grok, and other agents hand off the agreed draft to Grok Bot when supported. Otherwise, provide the draft in chat and say it is still pending. Grok Bot reads the latest backlog and adds the agreed ideas using the list’s existing format and next available B-number, or updates the existing entries the user revised. Preserve unrelated entries and commit the backlog update by itself. On retry, check for entries already written. Follow [the repository workflow](../../AGENTS.md) and report the number of saved items and where they landed. Confirm persistence only after verifying the write.

Use a short title and a description of the intended outcome for each item. Include relevant constraints and open questions. Brainstorming entries are backlog items. The decision about when to turn them into specs is open.

## Voice session records

Save only the agreed final to-do entries. Keep the conversation and interim drafts in the session. The prompt-history rule in AGENTS.md exempts these sessions. Omit transcripts, verbatim quotes, and per-turn notes from the repository and from any handoff to Grok Bot.
