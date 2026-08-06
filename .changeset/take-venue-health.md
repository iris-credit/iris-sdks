---
"@iris-credit/iris-sdk": minor
---

Validate the quote's health in the take flow: `take` now requires a pre-fetched `venueData` and rejects a quote whose debt exceeds the venue's max borrow for its collateral, capped by the venue LLTV minus `DEFAULT_LLTV_BUFFER` (`VenueMismatchError` / `IrisCoreErrors.UnknownVenuePrice` / `UnhealthyDebtError`). On Morpho Blue the max borrow LTV is the LLTV itself, so an uncapped take could open one accrual away from venue liquidation. Breaking: `getVenueData` now takes the venue-identifying fields directly — `{ pod?, venueId, collateralToken, debtToken, data }`, `pod` defaulting to the pod-less zero-address view, the shape a solver-signed `Quote` satisfies directly — replacing the `{ loanData, venueId, data }` form.
