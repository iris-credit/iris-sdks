---
"@iris-credit/core-sdk": minor
---

Mirror Iris's rebase netting in `PositionUtils.getRebasedPosition`: repayment a venue liquidation retires over the principal is floating interest the borrower's collateral paid, so it now nets against the fixed leg and the excess is slashed from the bond to the borrower's claimable. The borrower is credited at most the value of the collateral they lost (repayment a seized surplus funded is not netted), a resolved loan nets nothing, and a slash that exhausts the bond resolves the loan and forfeits the surplus. Live venue collateral above the tracked collateral and surplus (a direct venue supply) is tracked as the borrower's collateral. The input now takes `bond` and `fixedLeg`, and the result carries the rebased `bond` and `fixedLeg` alongside `bondSlashed`. `AccrualPosition.rebase` (and `repay`/`liquidate` through it) settles on the netted legs.
