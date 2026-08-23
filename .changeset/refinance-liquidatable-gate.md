---
"@iris-credit/core-sdk": minor
"@iris-credit/iris-sdk": patch
---

Mirror iris-core's refinance liquidatable gate: `AccrualPosition.refinance` now throws the new `IrisCoreErrors.LiquidatableLoan` once the loan is past `maturity + overduePeriod` at the accrual timestamp — the contract rejects the call the same way, and the error joins the vendored `irisAbi`. `Iris.refinance` inherits the rejection through the replay, evaluated at the 2h projected accrual timestamp like every other precondition.
