---
"@iris-credit/core-sdk": patch
---

Add `Venue.borrowApy` — the venue's current borrow-side APY as the venue itself quotes it (a unitless fraction). Aave V3 compounds the debt reserve's `currentVariableBorrowRate` per second over a year (the Aave app's `variableBorrowAPY` — the new `AaveV3Math.rateToApy`, backed by the new `AaveV3Math.rayPow`); Morpho Blue compounds the Adaptive Curve IRM's instantaneous rate at the market's utilization continuously (the new `MorphoBlueMath.rateToApy`), with the rate's adaptation projected to now — `MorphoBlueVenue.getBorrowApy(timestamp)` for a specific time; markets off the canonical IRM answer 0, matching their zero-rate accrual.
