---
"@iris-credit/core-sdk": minor
---

Mirror the revised Iris bond semantics: the bond requirement is a withdrawal floor, not a liquidation trigger. `PositionUtils.isHealthyBond` (and `AccrualPosition.isHealthyBond`) no longer reports a bond below its requirement as unhealthy — bond liquidation opens only on drawdown, so `getBondLiquidationSeizedAmount` / `seizableBond` return zero for such a bond. `AccrualPosition.withdrawBond` now enforces the floor explicitly, matching `Iris.withdrawBond`'s `bond >= bondRequirement && healthy` check; `getWithdrawableBond` already did and is unchanged. `AccrualPosition.liquidateBond` no longer zeroes the position's collateral: after a bond liquidation it stays tracked as the borrower's, recoverable with `withdrawCollateral` or `escape`.
