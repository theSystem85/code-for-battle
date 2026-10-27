- [x] **Bugfix: preserve seamless update navigation and recovery**
  Stop treating cache revalidation as a manual reload, bind the one-use battlefield frame to the target commit, retain save recovery until successful startup, and offer ordinary reload over the paused view if startup fails.
  Spec: none

The restart keeps the small top progress bar. Regression checks cover browser navigation classification, staged asset routing, preservation of the recovery flag, invalid saves, and a simulated startup failure followed by ordinary saved-game restoration. The feature remains experimental and off by default pending device acceptance.
