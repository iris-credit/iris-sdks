---
"@iris-credit/iris-sdk": patch
---

Include the new venue's `lastUpdate` in the refinance flow's accrual floor: the migration replay accrues the target venue too, so fetching it from a chain whose clock leads the local one by more than the 2h buffer (e.g. a time-warped devnet fork) no longer throws `InvalidInterestAccrual` before the tx is built.
