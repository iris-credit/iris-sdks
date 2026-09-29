---
"@iris-credit/iris-sdk": minor
---

Mirror the audited Iris close gates: `repay` and `close` throw `LoanResolvedError` only once the loan is resolved (bond requirement zero and debt, fixed leg and surplus all zero), so a loan whose bond requirement a venue liquidation zeroed with surplus outstanding can still be repaid, as `Iris.repay` allows. `escape` throws `LoanNotResolvedError` until the loan is resolved, matching `Iris.escape`, where it previously checked the bond requirement alone. Error messages and docs reserve resolved for that full condition; a zero bond requirement alone means the solver's bond obligation is over.
