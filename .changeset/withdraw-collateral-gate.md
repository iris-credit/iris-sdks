---
"@iris-credit/iris-sdk": minor
---

`iris.withdrawCollateral` throws `IrisCoreErrors.LiquidatableLoan` when `positionData` is liquidatable (past `maturity + overduePeriod`), before sizing the ceiling, matching the contract's new gate instead of surfacing it as a zero ceiling through `UnhealthyCollateralError`.
