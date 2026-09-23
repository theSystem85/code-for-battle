# Spec: Power/Money Status Bar Text Contrast

## Summary
Raise contrast of the power (energy) and money status bar value overlays by switching text from white to black.

## Requirements
- `#energyText`, `#moneyText`, and mobile equivalents (`.energy-bar-value`, `.money-bar-value`, `#mobileEnergyValue`, `#mobileMoneyValue`, `.mobile-resource-value` on the status bar) use black (`#000`) text.
- Inline styles applied when creating the desktop energy/money bars match the CSS (black text).
- Keep a light text-shadow so black values remain readable over the dark empty portion of each bar track.
- Do not change bar fill colors, layout, or tooltip chrome.

## Acceptance Criteria
- Desktop power and money bar overlays render black text.
- Mobile landscape and condensed portrait status bar money/power values render black text.
- Values remain legible on both filled (green/orange) and empty (dark track) regions.
