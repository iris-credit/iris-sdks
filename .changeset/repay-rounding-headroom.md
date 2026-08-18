---
"@iris-credit/iris-sdk": patch
---

Fund `repay` and `close` with one unit of rounding headroom (`REPAY_ROUNDING_HEADROOM`) on top of the 2h projection. Before maturity the settled fixed leg is two separately floored terms — accrued to the settlement timestamp, residual from there to maturity — whose exact sum does not depend on that timestamp, so the projection re-rounds the split rather than bounding it and the contract's figure at the mined block could sit one unit above the funding, reverting the pull with `ERC20: transfer amount exceeds balance` out of `GeneralAdapter1`. The sweep returns the unit.
