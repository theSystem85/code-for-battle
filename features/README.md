# Release digest

Add one JSON file per release, with this schema:

```json
{
  "version": "0.47.0",
  "features": ["A short description of a new capability."],
  "improvements": ["A short description of improved behavior."],
  "bugfixes": ["A short description of a corrected problem."]
}
```

Use numeric major.minor.patch versions matching the release's package version. Empty arrays are allowed. Do not change shipped notes or backdate new entries. The digest includes every release after the previous successful startup, up to and including the running version, so skipped releases are included. Notes are bundled into JavaScript for offline access. The User Manual retains the latest update's complete digest after startup finishes. On a fresh installation it shows all available notes through the current release.

The initial migration recognizes the predecessor, 0.46.0, when its service worker cannot report a version. Subsequent workers report their version. The loader records a version as successfully loaded only when startup reaches `ready`; failed loads do not acknowledge notes.
