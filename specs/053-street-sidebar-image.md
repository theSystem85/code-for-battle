# 053 - Street build button desert sidebar image

## Summary
- Replace the Street production button placeholder sidebar art with a dedicated desert-themed icon.
- Keep the existing production-button lazy-loading behavior (`src` remains placeholder, `data-src` points to the Street icon).

## Requirements
1. Add a new Street sidebar image asset under `public/images/sidebar/`.
2. Update the Street production button in `index.html` to reference the new asset via `data-src`.
3. Add an end-to-end test proving the Street button no longer points to the placeholder asset and that the icon file loads successfully in the browser.

## Acceptance Criteria
- Street button shows `alt="Street"` and `data-src="images/sidebar/street_sidebar.svg"`.
- Existing lazy-image behavior is unchanged (`src` still uses `images/sidebar/placeholder.webp` until loaded).
- Playwright E2E test passes validating the asset wiring and successful icon load.
