# 2026-09-26T20:46:00Z

Grok 4.7 in the Cursor cloud agent. Token counts are not available to this agent. Elapsed time is recorded when the task finishes.

## Prompt

Follow-up on PR #717 from Patrick: the bare invite code must be SHORT and human-typeable, about 6 characters (10 at most), and it may differ from the long token in the invitation link. Every player slot/party gets its own distinct short code.

Implement:
- Generate a short code per invite (per player/party), e.g. 6 chars from an unambiguous alphabet (uppercase letters and digits without 0/O/1/I/L). Display it in the host invite dialog, maybe grouped like ABC-123 for readability, with a Copy button. The link keeps its long token.
- Resolve the short code to the full invite token/session: store the mapping wherever invites/signalling are handled (host-side and/or the existing /api signalling/Netlify functions). Look at how the long token is resolved now and add a lookup for short codes. Handle collisions (regenerate on collision among active invites), expiry together with the invite, and case-insensitive input that ignores spaces and dashes.
- The join field accepts: a full link (long token), the short code, and for compatibility the long bare token too. Validation error for anything else. Keep the label "Invite code or link" / "Einladungscode oder Link".
- Unit tests: code generation (length, alphabet, uniqueness per player), normalization, resolution, and collision handling.
- Screenshots under /opt/cursor/artifacts: the host dialog with different short codes for two different players, and the join field with a short code entered. If you can exercise the resolution end to end (e.g. run the Netlify functions locally with `netlify dev` or a mock), show it; otherwise explain.
- Update docs/specs for the invite flow. Run `npm run test:unit` and ESLint. Rebase onto latest main (no merge commits), push with --force-with-lease to the same branch/PR, and update the PR description.
