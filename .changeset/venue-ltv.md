---
"@iris-credit/core-sdk": patch
---

Add `Venue.ltv` — the venue's maximum borrow LTV (scaled by WAD), the limit new debt is validated against: Aave V3 answers the collateral reserve's max LTV (not the venue's `lltv`, Aave's liquidation threshold), Morpho Blue answers the market's LLTV itself.
