- [x] **Revalidate the live-update manifest**
  Prevent browsers and Netlify's edge cache from retaining `build-info.json`, so an open single-player game discovers each CSS-only deploy and swaps its hashed stylesheet without reloading or losing state.
  Spec: none
