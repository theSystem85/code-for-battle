- [x] **Improvement: keep update actions in the sidebar and notification history**
  Place the update button immediately left of Online/Offline, remove its floating map positioning, and share one update/reload action between the button, notification link and history row.
  Spec: none
  Validation: 4,848 unit tests, Chromium sidebar placement check, full lint and production build passed. Focused update tests verify all three entry points activate the waiting worker and reload once.
