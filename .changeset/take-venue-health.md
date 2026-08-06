---
"@iris-credit/iris-sdk": minor
---

Validate the quote's health in the take flow: `take` now requires a pre-fetched `venueData` — `getVenueData` accepts `{ quote }` to read a quote's venue before its pod exists — and rejects a quote whose debt exceeds the venue's max borrow for its collateral, capped by the venue LLTV minus `DEFAULT_LLTV_BUFFER` (`VenueMismatchError` / `IrisCoreErrors.UnknownVenuePrice` / `UnhealthyDebtError`). On Morpho Blue the max borrow LTV is the LLTV itself, so an uncapped take could open one accrual away from venue liquidation.
