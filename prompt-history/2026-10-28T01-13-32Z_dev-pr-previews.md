# 2026-10-28T01-13-32Z

Harness: Codex desktop. Model: GPT-6 (exact version, reasoning level, usage and duration not exposed).

## Request

Change that script so dev pr previews get deployed

## Implementation

Allow every deploy-preview context without a GitHub API lookup, retain dev-only standalone branch deployments, and update tests and current deployment guidance. Apply to PR #789 so its next commit triggers a preview.
