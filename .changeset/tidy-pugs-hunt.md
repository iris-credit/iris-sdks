---
"@iris-credit/iris-sdk": minor
---

Add the `repayEscape` flow and the `irisRepayEscape` action: repay an Iris loan and recover its collateral in one bundle. `Iris.repay` resolves the loan but leaves the collateral on the venue, so the bundle repays first — clearing the bond requirement `Iris.escape` checks — then exits the venue position to the receiver. The exit runs on `escape` rather than `withdrawCollateral` so it takes the venue balance as it stands at execution, instead of an amount a rebase can invalidate. Unlike the permissionless `repay`, `userAddress` must be the loan's borrower: `GeneralAdapter1.irisEscape` pins them as the bundle initiator.
