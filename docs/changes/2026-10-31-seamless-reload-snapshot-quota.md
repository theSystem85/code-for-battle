- [x] **Keep seamless reloads working within snapshot storage quotas**
  Retry the preserved battlefield snapshot at progressively bounded resolutions when browser session storage rejects a full-resolution canvas capture, so the saved local match can still cross a script update without showing the loading screen.
  Spec: none
