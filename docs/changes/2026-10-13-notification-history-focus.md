- [x] **Bug: notification history loses unit focus links**
  Preserve the original focus action on linked attack and harvester-promotion notifications so clicking or activating their history row selects and focuses the same unit.
  Spec: none
  Validation: 4,830 unit tests, full lint and a Chromium regression comparing the original alert with history click/Enter/Space after expiry passed.
