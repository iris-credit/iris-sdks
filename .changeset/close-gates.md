---
"@iris-credit/iris-sdk": minor
---

Mirror the audited Iris close gates: `repay` and `close` throw `LoanResolvedError` only once the loan is closed (bond requirement zero and debt, fixed leg and surplus all zero), so a loan a venue liquidation resolved with surplus outstanding can still be repaid, as `Iris.repay` allows. `escape` throws `LoanNotResolvedError` until the loan is closed, matching `Iris.escape`, where it previously checked the bond requirement alone. Error messages and docs now distinguish a resolved loan (bond obligation over) from a closed one.
