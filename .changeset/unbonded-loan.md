---
"@iris-credit/core-sdk": minor
---

Rename `IrisCoreErrors.LoanResolved` to `IrisCoreErrors.UnbondedLoan`. `AccrualPosition.refinance` throws it when the bond requirement is zero (Iris's `ZeroAmount`), which ends the solver's bond obligation but does not resolve the loan: a loan is resolved once the bond requirement, debt, fixed leg and surplus are all zero, as `Iris.escape` requires and iris-sdk's `LoanResolvedError` reports.
