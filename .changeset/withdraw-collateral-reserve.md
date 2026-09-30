---
"@iris-credit/core-sdk": minor
---

Mirror the reworked `Iris.withdrawCollateral` check. `PositionUtils.getRequiredCollateralValue` now reserves the debt plus the projected liquidation exposure, `max(fixedLeg + residual, floatingLeg - bond)`, instead of `debt + fixedLeg + residual`, and takes the position's `floatingLeg` and `bond`; `isHealthy` and `getWithdrawableCollateral` (and the `AccrualPosition` getters over them) follow. `getWithdrawableCollateral` returns `0n` once the loan is liquidatable, and `AccrualPosition.withdrawCollateral` throws `IrisCoreErrors.LiquidatableLoan`, as Iris now rejects withdrawals past `maturity + overduePeriod`.
